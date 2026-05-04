import crypto from 'crypto';

export const ADMIN_SESSION_COOKIE = 'convert-to-pdf-admin-session';

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

export function createAdminCookieValue() {
  return '1';
}

export function isAdminCookieValid(value) {
  return String(value || '') === createAdminCookieValue();
}
