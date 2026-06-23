import crypto from 'crypto';

export const ADMIN_SESSION_COOKIE = 'convert-to-pdf-admin-session';
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function getAdminAccessToken() {
  return process.env.ADMIN_ACCESS_TOKEN || process.env.ADMIN_METRICS_TOKEN || '';
}

export function isAdminTokenValid(token) {
  const configuredToken = getAdminAccessToken();

  if (!configuredToken || !token) {
    return false;
  }

  const expected = Buffer.from(configuredToken);
  const actual = Buffer.from(String(token));

  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}

function signSessionTimestamp(timestamp, secret) {
  return crypto.createHmac('sha256', secret).update(String(timestamp)).digest('hex');
}

export function createAdminCookieValue() {
  const secret = getAdminAccessToken();
  if (!secret) {
    return null;
  }

  const timestamp = Date.now();
  const signature = signSessionTimestamp(timestamp, secret);
  return `${timestamp}.${signature}`;
}

export function isAdminCookieValid(value) {
  const secret = getAdminAccessToken();
  if (!secret) {
    return false;
  }

  const sessionValue = String(value || '');
  const [timestampRaw, signature] = sessionValue.split('.');
  const timestamp = Number(timestampRaw);

  if (!timestampRaw || !signature || !Number.isFinite(timestamp)) {
    return false;
  }

  if (Date.now() - timestamp > ADMIN_SESSION_TTL_MS) {
    return false;
  }

  const expected = Buffer.from(signSessionTimestamp(timestamp, secret));
  const actual = Buffer.from(signature);

  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}
