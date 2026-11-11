import { createHmac } from 'node:crypto';
import type { RequestHandler } from 'express';
import { rateLimitResultSchema, type RateLimitKey } from '@songsmith/schemas';
import type { Service } from './auth.js';
import type { FlagService } from './flags.js';
import { requestContext } from './correlation.js';
import { AppError } from './errors.js';

export interface RateLimitOption {
  key: RateLimitKey;
  by: 'user' | 'ip' | 'user_or_ip';
}
export function rateLimitIdentity(
  option: RateLimitOption,
  userId: string | undefined,
  ip: string | undefined,
  secret: string,
) {
  if (option.by !== 'ip' && userId) return `${option.key}:user:${userId}`;
  if (option.by === 'user') throw new AppError('UNAUTHENTICATED');
  if (!ip) throw new AppError('INTERNAL');
  const hash = createHmac('sha256', secret)
    .update(`songsmith:rate-limit:ip:${ip}`)
    .digest('hex');
  return `${option.key}:ip:${hash}`;
}
export function rateLimitStage(
  service: Service,
  flags: FlagService,
  secret: string,
): RequestHandler {
  return async (req, res, next) => {
    const store = requestContext.getStore();
    const option = store?.rateLimit;
    if (!option) {
      next();
      return;
    }
    const limit = await flags.getFlag(`rate_limit:${option.key}`);
    const result = await service()
      .schema('app')
      .rpc('rate_limit_hit', {
        key: rateLimitIdentity(option, store.userId, req.ip, secret),
        window_seconds: limit.windowSeconds,
        max: limit.max,
      });
    if (result.error) throw new AppError('INTERNAL');
    const row = rateLimitResultSchema.parse(result.data)[0];
    if (!row) throw new AppError('INTERNAL');
    if (!row.allowed) {
      res.setHeader(
        'Retry-After',
        Math.max(1, Math.ceil((Date.parse(row.reset_at) - Date.now()) / 1000)),
      );
      throw new AppError('RATE_LIMITED');
    }
    next();
  };
}
export async function cleanupRateLimits(service: Service) {
  const result = await service().schema('app').rpc('cleanup_rate_limits');
  if (result.error) throw new Error('Rate limit cleanup failed');
}
