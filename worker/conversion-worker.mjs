import http from 'http';
import path from 'path';
import { prisma } from '../src/lib/db.mjs';
import { allowedExtensions, maxFileSize, convertFilesToPdfBuffer } from '../src/lib/conversion.mjs';
import { readJobArtifact, writeJobOutputArtifact, deleteJobInputs } from '../src/lib/job-storage.mjs';
import { sendJobWebhook } from '../src/lib/webhook.mjs';

const port = Number(process.env.CONVERSION_WORKER_PORT || 4000);
const workerToken = process.env.CONVERSION_WORKER_TOKEN || '';
const pollIntervalMs = Number(process.env.CONVERSION_WORKER_POLL_INTERVAL_MS || 5000);
const maxAttempts = Number(process.env.CONVERSION_WORKER_MAX_ATTEMPTS || 3);
const retryBaseDelayMs = Number(process.env.CONVERSION_WORKER_RETRY_BASE_DELAY_MS || 5000);

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function resolveFiles(files) {
  return Promise.all(
    files.map(async (file) => {
      const buffer = file.storageKey
        ? await readJobArtifact(file.storageKey)
        : Buffer.from(file.data || '', 'base64');

      return {
        name: file.name,
        buffer,
      };
    })
  );
}

async function validateFiles(files) {
  if (files.length === 0) {
    throw new Error('Missing files');
  }

  if (files.length > 10) {
    throw new Error('Too many files. Maximum allowed is 10.');
  }

  const totalSize = files.reduce((sum, file) => {
    const buffer = Buffer.from(file.data || '', 'base64');
    return sum + buffer.length;
  }, 0);

  if (totalSize > 50 * 1024 * 1024) {
    throw new Error('Total upload size exceeds the 50MB limit.');
  }

  for (const file of files) {
    const buffer = Buffer.from(file.data || '', 'base64');
    const extension = path.extname(String(file.name || '')).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      throw new Error(`Unsupported file type: ${extension || 'unknown'}`);
    }

    if (buffer.length > maxFileSize) {
      throw new Error(`File too large: ${file.name || 'unnamed-file'}`);
    }
  }
}

async function convertPayloadToPdfBuffer(files, compress) {
  await validateFiles(files);
  const resolvedFiles = await resolveFiles(files);
  return convertFilesToPdfBuffer(resolvedFiles, compress);
}

async function processQueuedJob(job) {
  const files = job.files || [];
  const pdfBuffer = await convertFilesToPdfBuffer(
    await resolveFiles(
      files.map((file) => {
        if (!file.storageKey) {
          throw new Error(`Missing storage artifact for ${file.originalName || 'file'}`);
        }

        return {
          name: file.originalName,
          storageKey: file.storageKey,
        };
      })
    ),
    job.compress,
    { pageNumbers: job.pageNumbers, watermarkText: job.watermarkText }
  );

  const outputKey = await writeJobOutputArtifact(job.id, pdfBuffer);

  await prisma.conversionJob.update({
    where: { id: job.id },
    data: {
      status: 'completed',
      finishedAt: new Date(),
      outputSize: pdfBuffer.length,
      outputKey,
      errorMessage: null,
      nextRetryAt: null,
    },
  });

  if (job.razorpayOrderId) {
    await prisma.conversionOrder.update({
      where: { razorpayOrderId: job.razorpayOrderId },
      data: { status: 'completed' },
    });
  }

  await deleteJobInputs(job.id);

  try {
    await sendJobWebhook(job, {
      jobId: job.id,
      status: 'completed',
      downloadUrl: `/api/jobs/${job.id}/download`,
    });
    if (job.webhookUrl) {
      await prisma.conversionJob.update({
        where: { id: job.id },
        data: { webhookSentAt: new Date() },
      }).catch(() => {});
    }
  } catch (error) {
    console.error('Failed to send completion webhook:', error);
  }
}

async function claimNextQueuedJob() {
  const nextJob = await prisma.conversionJob.findFirst({
    where: {
      status: 'queued',
      OR: [
        { nextRetryAt: null },
        { nextRetryAt: { lte: new Date() } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    include: {
      files: {
        orderBy: { orderIndex: 'asc' },
      },
    },
  });

  if (!nextJob) {
    return null;
  }

  const claimed = await prisma.conversionJob.updateMany({
    where: {
      id: nextJob.id,
      status: 'queued',
    },
    data: {
      status: 'processing',
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  if (claimed.count === 0) {
    return null;
  }

  return {
    ...nextJob,
    attempts: nextJob.attempts + 1,
  };
}

const safeErrorPrefixes = [
  'Unsupported file type:',
  'File too large:',
  'Missing files',
  'Too many files',
  'Total upload size exceeds',
  'No valid content found for PDF generation',
  'Missing storage artifact for',
];

function sanitizeErrorMessage(error) {
  const message = error?.message || '';
  if (safeErrorPrefixes.some((prefix) => message.startsWith(prefix))) {
    return message;
  }
  return 'Unable to convert file: the document is invalid, corrupted, or unsupported.';
}

let isPolling = false;

async function processQueuedJobs() {
  if (isPolling) return;
  isPolling = true;

  try {
    while (true) {
      const job = await claimNextQueuedJob();
      if (!job) return;

      try {
        await processQueuedJob(job);
      } catch (error) {
        console.error('Queued conversion job failed:', error);

        const shouldRetry = job.attempts < maxAttempts;
        const retryDelay = retryBaseDelayMs * Math.pow(2, Math.max(0, job.attempts - 1));
        const errorMessage = sanitizeErrorMessage(error);

        await prisma.conversionJob.update({
          where: { id: job.id },
          data: shouldRetry
            ? {
                status: 'queued',
                errorMessage,
                nextRetryAt: new Date(Date.now() + retryDelay),
              }
            : {
                status: 'failed',
                finishedAt: new Date(),
                errorMessage,
                nextRetryAt: null,
              },
        }).catch(() => {});

        if (!shouldRetry) {
          await deleteJobInputs(job.id).catch(() => {});
          await sendJobWebhook(job, {
            jobId: job.id,
            status: 'failed',
            errorMessage,
          }).catch(() => {});
          if (job.webhookUrl) {
            await prisma.conversionJob.update({
              where: { id: job.id },
              data: { webhookSentAt: new Date() },
            }).catch(() => {});
          }
        }
      }
    }
  } finally {
    isPolling = false;
  }
}

setInterval(() => {
  processQueuedJobs().catch((error) => {
    console.error('Queue polling error:', error);
  });
}, pollIntervalMs);

setTimeout(() => {
  processQueuedJobs().catch((error) => {
    console.error('Initial queue polling error:', error);
  });
}, 0);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, {
        success: true,
        status: 'ok',
        service: 'conversion-worker',
      });
      return;
    }

    if (req.method !== 'POST' || req.url !== '/convert') {
      sendJson(res, 404, { success: false, message: 'Not found' });
      return;
    }

    if (!workerToken || req.headers['x-conversion-worker-token'] !== workerToken) {
      sendJson(res, 401, { success: false, message: 'Unauthorized worker request' });
      return;
    }

    const rawBody = await readRequestBody(req);
    const payload = JSON.parse(rawBody.toString('utf8') || '{}');
    const files = Array.isArray(payload.files) ? payload.files : [];
    const compress = payload.compress === true;

    const pdfBuffer = await convertPayloadToPdfBuffer(files, compress);

    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="converted-document.pdf"',
    });
    res.end(pdfBuffer);
  } catch (error) {
    console.error('Conversion worker error:', error);
    sendJson(res, 500, {
      success: false,
      message: 'Worker conversion failed',
      error: error.message,
    });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Conversion worker listening on port ${port}`);
});
