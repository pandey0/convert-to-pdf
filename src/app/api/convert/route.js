import { NextResponse } from 'next/server';
import crypto from 'crypto';
import path from 'path';
import { prisma } from '../../../lib/db.mjs';
import { rateLimit } from '../../../lib/rate-limit';
import { getClientIp, hashIdentifier } from '../../../lib/request';
import { requireRazorpayConfig } from '../../../lib/razorpay';
import { allowedExtensions, maxFileSize } from '../../../lib/conversion.mjs';
import {
    writeJobArtifact,
    deleteJobArtifacts,
    deleteJobInputs,
    deleteJobOutputs,
} from '../../../lib/job-storage.mjs';

const maxFileCount = 10;
const maxTotalUploadSize = 50 * 1024 * 1024;

export async function POST(req) {
  let job = null;
  try {
        const ip = getClientIp(req);
        const ipHash = hashIdentifier(ip);
        const limitResult = await rateLimit(`convert:${ipHash}`, 10, 60000); // 10 conversions per minute

        if (!limitResult.success) {
            return NextResponse.json(
                { success: false, message: 'Too many requests. Please try again later.' },
                { status: 429 }
            );
        }

        let formData;
        try {
            formData = await req.formData();
        } catch {
            return NextResponse.json(
                { success: false, message: 'Invalid form data' },
                { status: 400 }
            );
        }

        const files = formData.getAll('file'); // Get all files in the queue
        const compress = formData.get('compress') === 'true';
        const orderId = formData.get('razorpay_order_id');
        const paymentId = formData.get('razorpay_payment_id');
        const signature = formData.get('razorpay_signature');
        const webhookUrl = formData.get('webhookUrl') || null;
        const pageNumbers = formData.get('pageNumbers') === 'true';
        const watermarkText = formData.get('watermarkText') || null;

        if (webhookUrl) {
            try {
                const parsedWebhookUrl = new URL(webhookUrl);
                if (parsedWebhookUrl.protocol !== 'http:' && parsedWebhookUrl.protocol !== 'https:') {
                    throw new Error('Invalid protocol');
                }
            } catch {
                // Known limitation: we only validate that this parses as an http(s) URL.
                // Full SSRF protection (resolving the hostname and rejecting private/internal
                // IP ranges) is intentionally out of scope for this pass.
                return NextResponse.json(
                    { success: false, message: 'Invalid webhook URL' },
                    { status: 400 }
                );
            }
        }

        if (files.length === 0) {
            return NextResponse.json({ success: false, message: 'Missing files' }, { status: 400 });
        }

        if (files.length > maxFileCount) {
            return NextResponse.json(
                { success: false, message: `Too many files. Maximum allowed is ${maxFileCount}.` },
                { status: 400 }
            );
        }

        const totalUploadSize = files.reduce((sum, file) => sum + (file?.size || 0), 0);

        if (totalUploadSize > maxTotalUploadSize) {
            return NextResponse.json(
                { success: false, message: 'Total upload size exceeds the 50MB limit.' },
                { status: 413 }
            );
        }

        for (const file of files) {
            if (file.size > maxFileSize) {
                return NextResponse.json(
                    { success: false, message: `File too large: ${file.name}` },
                    { status: 413 }
                );
            }

            const extension = path.extname(file.name).toLowerCase();

            if (!allowedExtensions.has(extension)) {
                return NextResponse.json(
                    { success: false, message: `Unsupported file type: ${extension || 'unknown'}` },
                    { status: 400 }
                );
            }
        }

        let usage = await prisma.userUsage.findUnique({ where: { ipHash } });
        const canUseFree = !usage || !usage.usedFree;
        const isActuallyFree = (process.env.NEXT_PUBLIC_SKIP_PAYMENT === 'true') || canUseFree;

        if (!isActuallyFree) {
            if (!orderId || !paymentId || !signature) {
                return NextResponse.json({ success: false, message: 'Free limit reached. Payment required.' }, { status: 402 });
            }

            requireRazorpayConfig();

            const generated_signature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder')
                .update(orderId + '|' + paymentId)
                .digest('hex');

            if (generated_signature !== signature) {
                return NextResponse.json({ success: false, message: 'Invalid payment signature' }, { status: 400 });
            }

            const dbOrder = await prisma.conversionOrder.findUnique({
                where: { razorpayOrderId: orderId },
            });

            if (!dbOrder) {
                return NextResponse.json({ success: false, message: 'Unknown payment order' }, { status: 404 });
            }

            if (dbOrder.status === 'completed') {
                return NextResponse.json({ success: false, message: 'Order already used' }, { status: 409 });
            }

            await prisma.conversionOrder.update({
                where: { razorpayOrderId: orderId },
                data: { status: 'paid' },
            });
        } else if (canUseFree && (process.env.NEXT_PUBLIC_SKIP_PAYMENT !== 'true')) {
            await prisma.userUsage.upsert({
                where: { ipHash },
                update: { usedFree: true },
                create: { ipHash, usedFree: true }
            });
        }

        job = await prisma.conversionJob.create({
            data: {
                ipHash,
                compress,
                fileCount: files.length,
                totalSize: totalUploadSize,
                razorpayOrderId: orderId || null,
                razorpayPaymentId: paymentId || null,
                paymentStatus: isActuallyFree ? 'not_required' : 'paid',
                status: 'staging',
                webhookUrl,
                pageNumbers,
                watermarkText,
                files: {
                    create: files.map((file, index) => ({
                        originalName: file.name,
                        mimeType: file.type || null,
                        size: file.size,
                        orderIndex: index,
                    })),
                },
            },
            include: {
                files: true,
            },
        });

        const conversionFiles = [];

        for (const file of files) {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const storageKey = await writeJobArtifact(job.id, conversionFiles.length, file.name, buffer);

            await prisma.conversionJobFile.updateMany({
                where: {
                    jobId: job.id,
                    orderIndex: conversionFiles.length,
                },
                data: {
                    storageKey,
                },
            });

            conversionFiles.push({
                name: file.name,
                buffer,
                storageKey,
            });
        }

        if (conversionFiles.length === 0) {
            throw new Error('No valid content found for PDF generation');
        }

        await prisma.conversionJob.update({
            where: { id: job.id },
            data: { status: 'queued' },
        });

        return NextResponse.json(
            {
                success: true,
                message: 'Conversion job queued',
                job: {
                    id: job.id,
                    status: 'queued',
                    paymentStatus: isActuallyFree ? 'not_required' : 'paid',
                    downloadUrl: `/api/jobs/${job.id}/download`,
                    statusUrl: `/api/jobs/${job.id}`,
                },
            },
            { status: 202 }
        );

    } catch (error) {
        console.error('Error in conversion:', error);

        if (job?.id) {
            await prisma.conversionJob.update({
                where: { id: job.id },
                data: {
                    status: 'failed',
                    finishedAt: new Date(),
                    errorMessage: error.message,
                },
            }).catch(() => {});

            await deleteJobArtifacts(job.id).catch(() => {});
            await deleteJobOutputs(job.id).catch(() => {});
        }

        return NextResponse.json(
             { success: false, message: 'Conversion failed', error: error.message },
             { status: 500 }
        );
    }
}
