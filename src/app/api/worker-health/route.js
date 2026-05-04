import { NextResponse } from 'next/server';

export async function GET() {
  const workerUrl = process.env.CONVERSION_WORKER_URL;

  if (!workerUrl) {
    return NextResponse.json(
      { success: false, status: 'not-configured', message: 'CONVERSION_WORKER_URL is missing' },
      { status: 503 }
    );
  }

  const healthUrl = new URL('/health', workerUrl).toString();

  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      cache: 'no-store',
    });

    const body = await response.json().catch(() => ({}));

    return NextResponse.json(
      {
        success: response.ok,
        workerUrl: healthUrl,
        worker: body,
      },
      { status: response.ok ? 200 : 503 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        workerUrl: healthUrl,
        message: 'Worker health check failed',
        error: error.message,
      },
      { status: 503 }
    );
  }
}
