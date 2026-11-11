import { z } from 'zod';

export const errorCatalogue = {
  UNAUTHENTICATED: { status: 401, messageKey: 'errors.UNAUTHENTICATED' },
  FORBIDDEN: { status: 403, messageKey: 'errors.FORBIDDEN' },
  CONSENT_REQUIRED: { status: 403, messageKey: 'errors.CONSENT_REQUIRED' },
  NOT_ADULT: { status: 403, messageKey: 'errors.NOT_ADULT' },
  PAYLOAD_TOO_LARGE: { status: 413, messageKey: 'errors.PAYLOAD_TOO_LARGE' },
  VALIDATION: { status: 400, messageKey: 'errors.VALIDATION' },
  MODERATION_BLOCKED: { status: 422, messageKey: 'errors.MODERATION_BLOCKED' },
  MODERATION_HARD_BLOCKED: {
    status: 422,
    messageKey: 'errors.MODERATION_HARD_BLOCKED',
  },
  INSUFFICIENT_CREDITS: {
    status: 402,
    messageKey: 'errors.INSUFFICIENT_CREDITS',
  },
  MODEL_NOT_ELIGIBLE: { status: 422, messageKey: 'errors.MODEL_NOT_ELIGIBLE' },
  RATE_LIMITED: { status: 429, messageKey: 'errors.RATE_LIMITED' },
  CONCURRENCY_LIMIT: { status: 429, messageKey: 'errors.CONCURRENCY_LIMIT' },
  CAP_REACHED: { status: 429, messageKey: 'errors.CAP_REACHED' },
  KILL_SWITCH: { status: 503, messageKey: 'errors.KILL_SWITCH' },
  PROVIDER_TIMEOUT: { status: 504, messageKey: 'errors.PROVIDER_TIMEOUT' },
  NOT_FOUND: { status: 404, messageKey: 'errors.NOT_FOUND' },
  CONFLICT: { status: 409, messageKey: 'errors.CONFLICT' },
  INTERNAL: { status: 500, messageKey: 'errors.INTERNAL' },
} as const;

export type ErrorCode = keyof typeof errorCatalogue;
export const errorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CONSENT_REQUIRED',
  'NOT_ADULT',
  'VALIDATION',
  'PAYLOAD_TOO_LARGE',
  'MODERATION_BLOCKED',
  'MODERATION_HARD_BLOCKED',
  'INSUFFICIENT_CREDITS',
  'MODEL_NOT_ELIGIBLE',
  'RATE_LIMITED',
  'CONCURRENCY_LIMIT',
  'CAP_REACHED',
  'KILL_SWITCH',
  'PROVIDER_TIMEOUT',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL',
]);
export const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: errorCodeSchema,
    message: z.string().min(1),
    details: z.record(z.string(), z.json()).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
