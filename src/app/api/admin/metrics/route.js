import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db';
import { ADMIN_SESSION_COOKIE, isAdminCookieValid, isAdminTokenValid } from '../../../../lib/admin-auth';

function readBearerToken(headerValue) {
  if (!headerValue) return null;
  const match = String(headerValue).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function GET(req) {
  try {
    const sessionCookie = req.cookies?.get(ADMIN_SESSION_COOKIE)?.value;
    const headerToken =
      req.headers.get('x-admin-metrics-token') ||
      readBearerToken(req.headers.get('authorization'));

    const hasCookieAccess = isAdminCookieValid(sessionCookie);
    const hasHeaderAccess = isAdminTokenValid(headerToken);

    if (!hasCookieAccess && !hasHeaderAccess) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized metrics request' },
        { status: 401 }
      );
    }

    const now = new Date();
    const [queuedCount, processingCount, retryingCount, failedCount, completedCount, pendingPaymentCount, paidPaymentCount, notRequiredPaymentCount, latestFailedJob, latestCompletedJob, oldestQueuedJob, oldestRetryingJob] =
      await Promise.all([
        prisma.conversionJob.count({ where: { status: 'queued' } }),
        prisma.conversionJob.count({ where: { status: 'processing' } }),
        prisma.conversionJob.count({
          where: {
            status: 'queued',
            nextRetryAt: { gt: now },
          },
        }),
        prisma.conversionJob.count({ where: { status: 'failed' } }),
        prisma.conversionJob.count({ where: { status: 'completed' } }),
        prisma.conversionJob.count({ where: { paymentStatus: 'pending' } }),
        prisma.conversionJob.count({ where: { paymentStatus: 'paid' } }),
        prisma.conversionJob.count({ where: { paymentStatus: 'not_required' } }),
        prisma.conversionJob.findFirst({
          where: { status: 'failed' },
          orderBy: { finishedAt: 'desc' },
          select: { id: true, errorMessage: true, attempts: true, finishedAt: true, createdAt: true },
        }),
        prisma.conversionJob.findFirst({
          where: { status: 'completed' },
          orderBy: { finishedAt: 'desc' },
          select: { id: true, finishedAt: true, createdAt: true, fileCount: true, totalSize: true },
        }),
        prisma.conversionJob.findFirst({
          where: { status: 'queued' },
          orderBy: { createdAt: 'asc' },
          select: { id: true, createdAt: true, nextRetryAt: true },
        }),
        prisma.conversionJob.findFirst({
          where: {
            status: 'queued',
            nextRetryAt: { gt: now },
          },
          orderBy: { nextRetryAt: 'asc' },
          select: { id: true, createdAt: true, nextRetryAt: true },
        }),
      ]);

    const queuedLagSeconds = oldestQueuedJob
      ? Math.max(0, Math.floor((now.getTime() - oldestQueuedJob.createdAt.getTime()) / 1000))
      : 0;

    const retryWaitSeconds = oldestRetryingJob?.nextRetryAt
      ? Math.max(0, Math.floor((oldestRetryingJob.nextRetryAt.getTime() - now.getTime()) / 1000))
      : 0;

    return NextResponse.json({
      success: true,
      generatedAt: now.toISOString(),
      queue: {
        queued: queuedCount,
        processing: processingCount,
        retrying: retryingCount,
        failed: failedCount,
        completed: completedCount,
        queuedLagSeconds,
        retryWaitSeconds,
        oldestQueuedJob,
        oldestRetryingJob,
      },
      payments: {
        pending: pendingPaymentCount,
        paid: paidPaymentCount,
        notRequired: notRequiredPaymentCount,
      },
      recent: {
        latestFailedJob,
        latestCompletedJob,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Failed to fetch metrics', error: error.message },
      { status: 500 }
    );
  }
}
