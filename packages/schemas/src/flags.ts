import { z } from 'zod';
import { queueConcurrencySchema, queueLimiterSchema } from './jobs.js';

const positive = z.number().int().positive().max(2147483647);
export const microUsdSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const rateLimitValueSchema = z.strictObject({
  max: positive,
  windowSeconds: positive.max(86400),
});
function flag<S extends z.ZodType, P extends boolean>(
  schema: S,
  value: z.output<S>,
  isPublic: P,
  description: string,
  placeholder = false,
) {
  return { schema, default: value, public: isPublic, description, placeholder };
}
// Add new adapters/operations here when their owning task introduces them.
// Caps and HTTP limits are mock-first placeholders, not live provider limits.
export const flagRegistry = {
  music_queue_concurrency: flag(
    queueConcurrencySchema,
    4,
    false,
    'Music workers per process',
  ),
  per_user_concurrency: flag(
    positive,
    2,
    false,
    'Concurrent music jobs per user',
  ),
  block_window_seconds: flag(
    positive,
    86400,
    false,
    'Moderation block counting window',
  ),
  block_cooldown_threshold: flag(positive, 3, false, 'Blocks before cooldown'),
  block_cooldown_seconds: flag(
    positive,
    3600,
    false,
    'Moderation cooldown duration',
  ),
  block_suspend_threshold: flag(positive, 6, false, 'Blocks before suspension'),
  'kill_switch:all': flag(z.boolean(), false, true, 'Disable all generation'),
  'kill_switch:provider:mock-music-a': flag(
    z.boolean(),
    false,
    true,
    'Disable mock-music-a',
  ),
  'kill_switch:provider:mock-music-b': flag(
    z.boolean(),
    false,
    true,
    'Disable mock-music-b',
  ),
  'kill_switch:provider:mock-text': flag(
    z.boolean(),
    false,
    true,
    'Disable mock-text',
  ),
  'kill_switch:provider:mock-image': flag(
    z.boolean(),
    false,
    true,
    'Disable mock-image',
  ),
  'kill_switch:provider:mock-image-safety': flag(
    z.boolean(),
    false,
    true,
    'Disable mock-image-safety',
  ),
  'kill_switch:provider:mock-align': flag(
    z.boolean(),
    false,
    true,
    'Disable mock-align',
  ),
  'kill_switch:operation:generate': flag(
    z.boolean(),
    false,
    true,
    'Disable generate',
  ),
  'kill_switch:operation:instrumental': flag(
    z.boolean(),
    false,
    true,
    'Disable instrumental',
  ),
  'kill_switch:operation:custom_lyrics': flag(
    z.boolean(),
    false,
    true,
    'Disable custom_lyrics',
  ),
  'kill_switch:operation:image_input': flag(
    z.boolean(),
    false,
    true,
    'Disable image_input',
  ),
  'kill_switch:operation:lyrics': flag(
    z.boolean(),
    false,
    true,
    'Disable lyrics',
  ),
  'kill_switch:operation:rewrite': flag(
    z.boolean(),
    false,
    true,
    'Disable rewrite',
  ),
  'kill_switch:operation:extend': flag(
    z.boolean(),
    false,
    true,
    'Disable extend',
  ),
  'kill_switch:operation:remix': flag(
    z.boolean(),
    false,
    true,
    'Disable remix',
  ),
  'kill_switch:operation:stems': flag(
    z.boolean(),
    false,
    true,
    'Disable stems',
  ),
  'kill_switch:operation:cover': flag(
    z.boolean(),
    false,
    true,
    'Disable cover',
  ),
  'kill_switch:operation:align': flag(
    z.boolean(),
    false,
    true,
    'Disable align',
  ),
  'kill_switch:operation:video': flag(
    z.boolean(),
    false,
    true,
    'Disable video',
  ),
  'rate_limit:me_patch': flag(
    rateLimitValueSchema,
    { max: 30, windowSeconds: 60 },
    false,
    'Placeholder HTTP limit for me_patch',
    true,
  ),
  'rate_limit:me_age': flag(
    rateLimitValueSchema,
    { max: 10, windowSeconds: 60 },
    false,
    'Placeholder HTTP limit for me_age',
    true,
  ),
  'rate_limit:me_consents': flag(
    rateLimitValueSchema,
    { max: 30, windowSeconds: 60 },
    false,
    'Placeholder HTTP limit for me_consents',
    true,
  ),
  'cap:user_daily_micro_usd': flag(
    microUsdSchema,
    300000,
    false,
    'Placeholder daily user cost cap',
    true,
  ),
  'cap:global_daily_micro_usd': flag(
    microUsdSchema,
    10000000,
    false,
    'Placeholder global daily cost cap',
    true,
  ),
  'cap:provider_daily_micro_usd:mock-music-a': flag(
    microUsdSchema,
    3000000,
    false,
    'Placeholder daily mock-music-a cost cap',
    true,
  ),
  'cap:provider_daily_micro_usd:mock-music-b': flag(
    microUsdSchema,
    3000000,
    false,
    'Placeholder daily mock-music-b cost cap',
    true,
  ),
  'cap:provider_daily_micro_usd:mock-text': flag(
    microUsdSchema,
    3000000,
    false,
    'Placeholder daily mock-text cost cap',
    true,
  ),
  'cap:provider_daily_micro_usd:mock-image': flag(
    microUsdSchema,
    3000000,
    false,
    'Placeholder daily mock-image cost cap',
    true,
  ),
  'cap:provider_daily_micro_usd:mock-image-safety': flag(
    microUsdSchema,
    3000000,
    false,
    'Placeholder daily mock-image-safety cost cap',
    true,
  ),
  'cap:provider_daily_micro_usd:mock-align': flag(
    microUsdSchema,
    3000000,
    false,
    'Placeholder daily mock-align cost cap',
    true,
  ),
  'music_queue_limiter:mock-music-a': flag(
    queueLimiterSchema.nullable(),
    null,
    false,
    'No provider limiter until configured from S-6',
  ),
  'music_queue_limiter:mock-music-b': flag(
    queueLimiterSchema.nullable(),
    null,
    false,
    'No provider limiter until configured from S-6',
  ),
} as const;
export type FlagKey = keyof typeof flagRegistry;
export type Flags = {
  [K in FlagKey]: z.output<(typeof flagRegistry)[K]['schema']>;
};
export type PublicFlagKey = {
  [K in FlagKey]: (typeof flagRegistry)[K]['public'] extends true ? K : never;
}[FlagKey];
export type RateLimitKey =
  Extract<FlagKey, `rate_limit:${string}`> extends `rate_limit:${infer K}`
    ? K
    : never;
export function isFlagKey(key: string): key is FlagKey {
  return Object.hasOwn(flagRegistry, key);
}
export const publicFlagsSchema = z.object(
  Object.fromEntries(
    Object.entries(flagRegistry)
      .filter(([, entry]) => entry.public)
      .map(([key, entry]) => [key, entry.schema]),
  ) as { [K in PublicFlagKey]: (typeof flagRegistry)[K]['schema'] },
);
export const flagRowsSchema = z.array(
  z.object({ key: z.string(), value: z.unknown() }),
);
export const rateLimitResultSchema = z
  .array(
    z.object({
      allowed: z.boolean(),
      remaining: z.number().int().nonnegative(),
      reset_at: z.iso.datetime({ offset: true }),
    }),
  )
  .length(1);
export const costScopeSchema = z.union([
  z.literal('global'),
  z.string().regex(/^user:[0-9a-f-]{36}$/),
  z.string().regex(/^provider:[a-zA-Z0-9_-]+$/),
]);
export const capStatusSchema = z
  .array(
    z.object({
      exceeded: z.array(z.enum(['user', 'provider', 'global'])),
      // SQL returns decimal text to preserve bigint precision over JSON.
      user_total: z.string().regex(/^\d+$/),
      provider_total: z.string().regex(/^\d+$/),
      global_total: z.string().regex(/^\d+$/),
    }),
  )
  .length(1);
