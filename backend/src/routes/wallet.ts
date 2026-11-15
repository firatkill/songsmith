import { z } from 'zod';
import { walletRowSchema, walletSchema } from '@songsmith/schemas';
import { caller, type Service } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
import { defineRoute, type RouteContext } from '../lib/route.js';

// T-20 minimal wallet (FR-08); ledger history, packs and top-up come in T-26..T-29.
export function registerWallet(context: RouteContext, service: Service) {
  defineRoute(context, {
    method: 'get',
    path: '/wallet',
    auth: 'required',
    description:
      'The caller’s credit balance, credits held by running jobs and the available amount (balance minus held).',
    request: { params: z.object({}), query: z.object({}) },
    response: { 200: walletSchema },
    responseHeaders: { 'Cache-Control': 'private, no-store' },
    handler: async () => {
      const { userId } = caller();
      const result = await service()
        .schema('app')
        .rpc('wallet_summary', { p_user_id: userId })
        .single();
      if (result.error) throw new AppError('INTERNAL');
      return {
        status: 200,
        body: walletSchema.parse(walletRowSchema.parse(result.data)),
      };
    },
  });
}
