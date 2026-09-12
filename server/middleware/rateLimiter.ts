import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.ts';
import { logSecurityEvent } from '../logger.ts';

interface UserUsage {
  count: number;
  resetAt: number;
}

const usageMap = new Map<string, UserUsage>();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20; // 20 requests per minute per user

export function isRateLimiterActive(): boolean {
  return typeof userRateLimiter === 'function' && MAX_REQUESTS_PER_WINDOW > 0;
}

export function getActiveRateLimitTrackerCount(): number {
  return usageMap.size;
}

export function userRateLimiter(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const uid = req.user?.uid;
  if (!uid) {
    return next();
  }

  const now = Date.now();
  let userUsage = usageMap.get(uid);

  if (!userUsage || now > userUsage.resetAt) {
    userUsage = { count: 1, resetAt: now + WINDOW_MS };
    usageMap.set(uid, userUsage);
    return next();
  }

  if (userUsage.count >= MAX_REQUESTS_PER_WINDOW) {
    logSecurityEvent('rate_limited', {
      uid,
      endpoint: req.originalUrl,
      reason: `Exceeded ${MAX_REQUESTS_PER_WINDOW} requests per window`,
      statusCode: 429,
    });

    const retryAfter = Math.ceil((userUsage.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: `You have reached the reflection request limit. Please pause for ${retryAfter} seconds before submitting again.`,
    });
  }

  userUsage.count += 1;
  next();
}
