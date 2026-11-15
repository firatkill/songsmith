import { z } from 'zod';
import {
  creditLedgerSchema,
  creditReservationSchema,
  creditJobSchema,
  creditDiscrepanciesSchema,
  creditIntegerSchema,
  lyricistJobSchema,
  type Database,
} from '@songsmith/schemas';
import type { Service } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';

// Supabase generated RPC arguments omit SQL nullability; the two narrow casts
// below restore nullable UUID/timestamp arguments accepted by the SQL signatures.
type Functions = Database['app']['Functions'];
// Sanitize database failures; no SQL detail or caller-supplied text reaches logs.
export function creditRpcResult<S extends z.ZodType>(
  result: { data: unknown; error: { code: string } | null },
  schema: S,
): z.output<S> {
  if (result.error) {
    switch (result.error.code) {
      case 'SS001':
        throw new AppError('INSUFFICIENT_CREDITS');
      case 'SS002':
        throw new AppError('ACCOUNT_RESTRICTED');
      case 'SS003':
        throw new AppError('CONCURRENCY_LIMIT');
      default:
        throw new AppError('INTERNAL');
    }
  }
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw new AppError('INTERNAL');
  return parsed.data;
}

export async function grantCredits(
  service: Service,
  args: Omit<
    Functions['grant_credits']['Args'],
    'p_ref_id' | 'p_expires_at'
  > & { p_ref_id: string | null; p_expires_at?: string | null },
) {
  return creditRpcResult(
    await service()
      .schema('app')
      .rpc('grant_credits', args as Functions['grant_credits']['Args']),
    creditLedgerSchema,
  );
}

export async function reserveCredits(
  service: Service,
  args: Omit<Functions['reserve_credits']['Args'], 'p_job_id'> & {
    p_job_id: string | null;
  },
) {
  return creditRpcResult(
    await service()
      .schema('app')
      .rpc('reserve_credits', args as Functions['reserve_credits']['Args']),
    creditReservationSchema,
  );
}

export async function startJob(
  service: Service,
  args: Functions['start_job']['Args'],
) {
  return creditRpcResult(
    await service().schema('app').rpc('start_job', args),
    creditJobSchema,
  );
}

export async function settleReservation(
  service: Service,
  args: Functions['settle_reservation']['Args'],
) {
  return creditRpcResult(
    await service().schema('app').rpc('settle_reservation', args),
    creditReservationSchema,
  );
}

export async function releaseReservation(
  service: Service,
  args: Functions['release_reservation']['Args'],
) {
  return creditRpcResult(
    await service().schema('app').rpc('release_reservation', args),
    creditReservationSchema,
  );
}

export async function refundSpend(
  service: Service,
  args: Functions['refund_spend']['Args'],
) {
  return creditRpcResult(
    await service().schema('app').rpc('refund_spend', args),
    creditLedgerSchema,
  );
}

export async function adjustCredits(
  service: Service,
  args: Functions['adjust_credits']['Args'],
) {
  return creditRpcResult(
    await service().schema('app').rpc('adjust_credits', args),
    creditLedgerSchema,
  );
}

export async function expireReservations(service: Service) {
  return creditRpcResult(
    await service().schema('app').rpc('expire_reservations'),
    creditIntegerSchema.nonnegative(),
  );
}

export async function reconcileCredits(service: Service) {
  return creditRpcResult(
    await service().schema('app').rpc('reconcile_credits'),
    creditDiscrepanciesSchema,
  );
}

// T-18 lyricist jobs: claim stores the body hash, complete settles the full
// price with the result, fail releases the hold. Each is one transaction.
export async function claimLyricistJob(
  service: Service,
  args: Functions['claim_lyricist_job']['Args'],
) {
  return creditRpcResult(
    await service().schema('app').rpc('claim_lyricist_job', args),
    lyricistJobSchema,
  );
}

export async function completeLyricistJob(
  service: Service,
  args: Functions['complete_lyricist_job']['Args'],
) {
  return creditRpcResult(
    await service().schema('app').rpc('complete_lyricist_job', args),
    lyricistJobSchema,
  );
}

export async function failLyricistJob(
  service: Service,
  args: Functions['fail_lyricist_job']['Args'],
) {
  return creditRpcResult(
    await service().schema('app').rpc('fail_lyricist_job', args),
    lyricistJobSchema,
  );
}
