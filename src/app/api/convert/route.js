import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '../../../lib/db';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import libre from 'libreoffice-convert';
import { promisify } from 'util';
import { marked } from 'marked';
import { rateLimit } from '../../../lib/rate-limit';

const convertAsync = promisify(libre.convert);

export async function POST(req) {
    try {
        const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
        const limitResult = rateLimit(ip, 10, 60000); // 10 conversions per minute

        if (!limitResult.success) {
            return NextResponse.json(
                { success: false, message: 'Too many requests. Please try again later.' },
                { status: 429 }
            );
        }

        const formData = await req.formData();
        const files = formData.getAll('file'); // Get all files in the queue
        const compress = formData.get('compress') === 'true';
        const orderId = formData.get('razorpay_order_id');
        const paymentId = formData.get('razorpay_payment_id');
        const signature = formData.get('razorpay_signature');

        if (files.length === 0) {
            return NextResponse.json({ success: false, message: 'Missing files' }, { status: 400 });
        }

        // Anonymized IP hashing for tracking
        const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
        
        let usage = await prisma.userUsage.findUnique({ where: { ipHash } });
        const canUseFree = !usage || !usage.usedFree;
        const isActuallyFree = (process.env.NEXT_PUBLIC_SKIP_PAYMENT === 'true') || canUseFree;

        if (!isActuallyFree) {
            if (!orderId || !paymentId || !signature) {
                return NextResponse.json({ success: false, message: 'Free limit reached. Payment required.' }, { status: 402 });
            }

            const generated_signature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder')
                .update(orderId + '|' + paymentId)
                .digest('hex');

            if (generated_signature !== signature) {
                if (process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_KEY_SECRET !== 'secret_placeholder') {
                    return NextResponse.json({ success: false, message: 'Invalid payment signature' }, { status: 400 });
                }
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

        // --- MULTI-PAGE PDF GENERATION LOGIC ---
        const mainPdfDoc = await PDFDocument.create();
        let pdfHasContent = false;

        for (const file of files) {
            // 10MB File Size Limit per file
            if (file.size > 10 * 1024 * 1024) continue;

            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const extension = path.extname(file.name).toLowerCase();

            if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
                let image;
                if (extension === '.png') {
                    image = await mainPdfDoc.embedPng(buffer);
                } else if (extension === '.webp') {
                    throw new Error('WebP not natively supported yet in multi-merge. Use PNG/JPG.');
                } else {
                    image = await mainPdfDoc.embedJpg(buffer);
                }
                const page = mainPdfDoc.addPage();
                const { width, height } = image.scale(1);
                page.setSize(width, height);
                page.drawImage(image, { x: 0, y: 0, width, height });
                pdfHasContent = true;
            } else {
                let finalBuffer = buffer;
                if (extension === '.md') {
                    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page { margin: 1in; } body { font-family: sans-serif; }</style></head><body>${marked.parse(buffer.toString())}</body></html>`;
                    finalBuffer = Buffer.from(htmlContent);
                }
                const singlePdfBuffer = await convertAsync(finalBuffer, '.pdf', undefined);
                const singlePdfDoc = await PDFDocument.load(singlePdfBuffer);
                const copiedPages = await mainPdfDoc.copyPages(singlePdfDoc, singlePdfDoc.getPageIndices());
                copiedPages.forEach((page) => mainPdfDoc.addPage(page));
                pdfHasContent = true;
            }
        }

        if (!pdfHasContent) {
            throw new Error('No valid content found for PDF generation');
        }

        const pdfBuffer = Buffer.from(await mainPdfDoc.save({
            useObjectStreams: compress, // Enable object streams if compression requested
            addDefaultPage: false,
        }));

        if (!isActuallyFree) {
            await prisma.conversionOrder.update({
                where: { razorpayOrderId: orderId },
                data: { status: 'completed' },
            });
        }

        return new Response(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="converted-document.pdf"`,
            },
        });

    } catch (error) {
        console.error('Error in conversion:', error);
        return NextResponse.json(
             { success: false, message: 'Conversion failed', error: error.message },
             { status: 500 }
        );
    }
}
