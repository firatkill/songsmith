import { z } from 'zod';

// Reject imprecise JSON numbers instead of accepting rounded bigint balances.
export const creditIntegerSchema = z.number().int();
const timestamp = z.iso.datetime({ offset: true });
export const creditLedgerSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  kind: z.enum([
    'signup_grant',
    'daily_grant',
    'purchase',
    'spend',
    'refund',
    'reversal',
    'expiry',
    'adjustment',
  ]),
  amount: creditIntegerSchema.refine((n) => n !== 0),
  balance_after: creditIntegerSchema,
  ref_kind: z.string(),
  ref_id: z.uuid().nullable(),
  idempotency_key: z.string().min(1),
  expires_at: timestamp.nullable(),
  created_at: timestamp,
});
export const creditReservationSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  job_id: z.uuid().nullable(),
  amount: creditIntegerSchema.positive(),
  status: z.enum(['active', 'settled', 'released', 'expired']),
  idempotency_key: z.string().min(1),
  expires_at: timestamp,
  settled_ledger_id: z.uuid().nullable(),
  settled_amount: creditIntegerSchema.nonnegative().nullable(),
  release_reason: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const creditJobSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  operation: z.enum([
    'lyrics',
    'rewrite',
    'generate',
    'extend',
    'remix',
    'stems',
    'cover',
    'video',
    'align',
  ]),
  model_id: z.string().nullable(),
  reservation_id: z.uuid(),
  idempotency_key: z.string().min(1),
  status: z.enum([
    'queued',
    'moderating',
    'running',
    'finishing',
    'ready',
    'failed',
    'refunded',
    'cancelled',
  ]),
});
export const creditDiscrepanciesSchema = z.array(
  z.object({
    user_id: z.uuid(),
    check: z.enum(['balance', 'held', 'balance_after', 'lots']),
    expected: creditIntegerSchema,
    actual: creditIntegerSchema,
  }),
);
export const jobReservationSchema = z.object({
  reservation_id: z.uuid().nullable(),
});
export type CreditLedger = z.infer<typeof creditLedgerSchema>;
export type CreditReservation = z.infer<typeof creditReservationSchema>;
