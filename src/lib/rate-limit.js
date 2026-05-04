import { prisma } from './db';

/**
 * Persistent rate limiter backed by the database.
 * The caller should pass a stable key, such as a route + hashed IP.
 */
export async function rateLimit(key, limit = 10, windowMs = 60000) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  await prisma.rateLimitCounter.deleteMany({
    where: {
      resetAt: {
        lt: now,
      },
    },
  });

  const existing = await prisma.rateLimitCounter.findUnique({
    where: { key },
  });

  if (!existing || existing.resetAt <= now) {
    await prisma.rateLimitCounter.upsert({
      where: { key },
      update: {
        count: 1,
        resetAt,
      },
      create: {
        key,
        count: 1,
        resetAt,
      },
    });

    return {
      success: true,
      remaining: Math.max(0, limit - 1),
      resetTime: resetAt,
    };
  }

  if (existing.count >= limit) {
    return {
      success: false,
      remaining: 0,
      resetTime: existing.resetAt,
    };
  }

  const updated = await prisma.rateLimitCounter.update({
    where: { key },
    data: {
      count: { increment: 1 },
    },
  });

  return {
    success: updated.count <= limit,
    remaining: Math.max(0, limit - updated.count),
    resetTime: updated.resetAt,
  };
}
