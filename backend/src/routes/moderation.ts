import { z } from 'zod';
import {
  moderationCheckSchema,
  moderationCheckResponseSchema,
} from '@songsmith/schemas';
import { caller, type Service } from '../lib/auth.js';
import { defineRoute, type RouteContext } from '../lib/route.js';
import {
  requireModerationAccount,
  type createModeration,
} from '../moderation/pipeline.js';
export function registerModeration(
  context: RouteContext,
  service: Service,
  moderate: ReturnType<typeof createModeration>,
) {
  defineRoute(context, {
    method: 'post',
    path: '/moderation/check',
    auth: 'required',
    rateLimit: { key: 'moderation_check', by: 'user' },
    request: {
      params: z.object({}),
      query: z.object({}),
      body: moderationCheckSchema,
    },
    response: { 200: moderationCheckResponseSchema },
    responseHeaders: { 'Cache-Control': 'private, no-store' },
    handler: async ({ body }) => {
      const { userId } = caller();
      await requireModerationAccount(service, userId);
      const result = await moderate({ ...body, userId });
      return {
        status: 200,
        body: moderationCheckResponseSchema.parse({
          decisionId: result.decisionId,
          action: result.action,
          explicit: result.explicit,
          ...(result.action === 'block' ? { category: result.category } : {}),
        }),
      };
    },
  });
}
