import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/db';
import { readJobArtifact, deleteJobOutputs } from '../../../../../lib/job-storage.mjs';

export async function GET(_req, { params }) {
  try {
    const job = await prisma.conversionJob.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        outputKey: true,
        outputSize: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, message: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status !== 'completed' || !job.outputKey) {
      return NextResponse.json(
        { success: false, message: 'Converted PDF is not ready yet' },
        { status: 409 }
      );
    }

    const pdfBuffer = await readJobArtifact(job.outputKey);

    if (process.env.DELETE_JOB_OUTPUT_AFTER_DOWNLOAD === 'true') {
      await prisma.conversionJob.update({
        where: { id: job.id },
        data: { outputKey: null },
      }).catch(() => {});
      await deleteJobOutputs(job.id).catch(() => {});
    }

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="converted-document.pdf"',
        'Content-Length': String(job.outputSize || pdfBuffer.length),
        'X-Conversion-Job-Id': job.id,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Failed to download converted PDF', error: error.message },
      { status: 500 }
    );
  }
}
