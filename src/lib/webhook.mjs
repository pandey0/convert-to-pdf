import crypto from 'crypto';

const webhookTimeoutMs = 5000;

// Sends a best-effort webhook notification for a conversion job.
// Delivery failures must never break the conversion job, so every
// failure mode here is swallowed and logged rather than thrown.
export async function sendJobWebhook(job, payload) {
  if (!job?.webhookUrl) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), webhookTimeoutMs);

  try {
    const headers = { 'Content-Type': 'application/json' };

    if (process.env.WEBHOOK_SIGNING_SECRET) {
      headers['X-Webhook-Signature'] = crypto
        .createHmac('sha256', process.env.WEBHOOK_SIGNING_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex');
    }

    await fetch(job.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    console.error('Webhook delivery failed:', error);
  } finally {
    clearTimeout(timeout);
  }
}
