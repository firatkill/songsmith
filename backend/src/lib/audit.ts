import type { RequestHandler } from 'express';
import type { Json } from '@songsmith/schemas';
import type { Service } from './auth.js';
import { requestContext } from './correlation.js';
import { AppError } from './errors.js';
import type { Logger } from './log.js';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  target: string;
  diff?: Json;
}

// Admin route handlers call this after a successful change; a failed audit write
// fails the request so no admin change goes unrecorded (SEC-10).
export async function writeAudit(service: Service, entry: AuditEntry) {
  const result = await service()
    .schema('app')
    .from('audit_log')
    .insert({
      actor_id: entry.actorId,
      action: entry.action,
      target: entry.target,
      diff: entry.diff ?? {},
    });
  if (result.error) throw new AppError('INTERNAL');
}

// For mounted tools whose handlers we do not own (Bull Board): record every
// successful non-GET request. Only the method and path are stored, never bodies.
export function auditMutations(
  service: Service,
  prefix: string,
  logger: Pick<Logger, 'error'>,
): RequestHandler {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      next();
      return;
    }
    const actorId = requestContext.getStore()?.userId ?? null;
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      writeAudit(service, {
        actorId,
        action: `${prefix}.${req.method.toLowerCase()}`,
        target: `${prefix}${req.path}`,
      }).catch(() => {
        logger.error({ action: prefix }, 'Audit write failed');
      });
    });
    next();
  };
}
