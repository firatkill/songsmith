import { z } from 'zod';
import { publicFlagsSchema } from '@songsmith/schemas';
import { defineRoute, type RouteContext } from '../lib/route.js';
import type { FlagService } from '../lib/flags.js';

export function registerFlags(context: RouteContext, flags: FlagService) {
  defineRoute(context, {
    method: 'get',
    path: '/flags/public',
    auth: 'public',
    request: { params: z.object({}), query: z.object({}) },
    response: { 200: publicFlagsSchema },
    responseHeaders: { 'Cache-Control': 'public, max-age=30' },
    description: 'Public kill-switch states only. Cached for 30 seconds.',
    handler: async () => ({
      status: 200,
      body: publicFlagsSchema.parse(await flags.getFlags()),
    }),
  });
}
