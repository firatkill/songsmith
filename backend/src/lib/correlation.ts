import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestHandler } from 'express';
import { newCorrelationId } from './ids.js';
export const requestContext = new AsyncLocalStorage<{
  correlationId: string;
  requestId: string;
  userId?: string;
  profile?: import('zod').infer<
    typeof import('@songsmith/schemas').profileSchema
  >;
  authMode?: 'public' | 'optional' | 'required';
  ageGateAllowed?: boolean;
}>();
export const correlation: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-correlation-id');
  const correlationId =
    incoming && /^[A-Za-z0-9_-]{1,64}$/.test(incoming)
      ? incoming
      : newCorrelationId();
  res.setHeader('x-correlation-id', correlationId);
  requestContext.run({ correlationId, requestId: newCorrelationId() }, next);
};
