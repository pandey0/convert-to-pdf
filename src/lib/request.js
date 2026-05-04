import crypto from 'crypto';

function firstForwardedIp(headerValue) {
  if (!headerValue) return null;
  return headerValue.split(',')[0].trim() || null;
}

export function getClientIp(req) {
  if (process.env.TRUST_PROXY_HEADERS !== 'true') {
    return '127.0.0.1';
  }

  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    firstForwardedIp(req.headers.get('x-forwarded-for')) ||
    '127.0.0.1'
  );
}

export function hashIdentifier(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
