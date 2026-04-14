// Simple in-memory rate limiter for the monolith
// This resets when the server restarts, which is fine for basic protection.

const rateLimitMap = new Map();

/**
 * Rate limiter function
 * @param {string} ip - The IP address to limit
 * @param {number} limit - Max requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Object} { success: boolean, remaining: number }
 */
export function rateLimit(ip, limit = 10, windowMs = 60000) {
  const now = Date.now();
  const userData = rateLimitMap.get(ip) || { count: 0, resetTime: now + windowMs };

  // If window expired, reset
  if (now > userData.resetTime) {
    userData.count = 0;
    userData.resetTime = now + windowMs;
  }

  userData.count += 1;
  rateLimitMap.set(ip, userData);

  return {
    success: userData.count <= limit,
    remaining: Math.max(0, limit - userData.count),
    resetTime: userData.resetTime
  };
}
