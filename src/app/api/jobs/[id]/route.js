import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db.mjs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req, { params }) {
  try {
    const { id } = await params;

    if (!uuidPattern.test(id)) {
      return NextResponse.json(
        { success: false, message: 'Job not found' },
        { status: 404 }
      );
    }

    const job = await prisma.conversionJob.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        compress: true,
        fileCount: true,
        totalSize: true,
        outputSize: true,
        errorMessage: true,
        razorpayOrderId: true,
        razorpayPaymentId: true,
        paymentStatus: true,
        attempts: true,
        nextRetryAt: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        updatedAt: true,
        outputKey: true,
        files: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            size: true,
            orderIndex: true,
            createdAt: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, message: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job: {
        ...job,
        outputKey: undefined,
        hasOutput: Boolean(job.outputKey),
        downloadUrl: job.outputKey ? `/api/jobs/${job.id}/download` : null,
      },
    });
  } catch (error) {
    console.error('Error fetching job:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch job' },
      { status: 500 }
    );
  }
}
