import { z } from 'zod';
import { healthResponseSchema } from '@songsmith/schemas';
import { defineRoute, type RouteContext } from '../lib/route.js';
import type { Env } from '../lib/env.js';
export function registerHealth(
  context: RouteContext,
  env: Pick<Env, 'APP_ENV' | 'PROVIDER_MODE'>,
  version: string,
) {
  defineRoute(context, {
    method: 'get',
    path: '/health',
    auth: 'public',
    request: { params: z.object({}), query: z.object({}) },
    response: { 200: healthResponseSchema },
    handler: () => ({
      status: 200 as const,
      body: {
        status: 'ok' as const,
        version,
        env: env.APP_ENV,
        providerMode: env.PROVIDER_MODE,
      },
    }),
  });
}
