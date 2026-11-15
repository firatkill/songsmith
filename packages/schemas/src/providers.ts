import { z } from 'zod';
export const operationSchema = z.enum([
  'generate',
  'instrumental',
  'custom_lyrics',
  'extend',
  'stems',
  'image_input',
]);
export type Operation = z.infer<typeof operationSchema>;
export const providerErrorCodeSchema = z.enum([
  'rate_limited',
  'timeout',
  'unavailable',
  'rejected_by_provider_policy',
  'invalid_request',
  'unknown',
]);
export type ProviderErrorCode = z.infer<typeof providerErrorCodeSchema>;
export const musicCapabilitiesSchema = z
  .strictObject({
    operations: z.array(operationSchema).min(1),
    maxDurationSec: z.number().int().positive(),
    minDurationSec: z.number().int().positive(),
    outputFormats: z.array(z.enum(['mp3', 'wav'])).min(1),
    controls: z.strictObject({
      bpm: z.boolean(),
      lengthControl: z.boolean(),
      vocalType: z.boolean(),
    }),
    returnsTimestamps: z.enum(['none', 'line', 'word']),
    returnsLyrics: z.boolean(),
    acceptsExternalAudio: z.boolean(),
    stemSets: z.array(z.string()),
    watermark: z.array(z.enum(['synthid', 'c2pa', 'none'])),
  })
  .refine((v) => v.minDurationSec <= v.maxDurationSec);
export type MusicCapabilities = z.infer<typeof musicCapabilitiesSchema>;
// Non-music interfaces have no capability method in TRD §8.1; their seed is {}.
export const emptyCapabilitiesSchema = z.strictObject({});
export const catalogueRowSchema = z.object({
  id: z.string().min(1),
  adapter: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  kind: z.enum(['music', 'text', 'image', 'alignment']),
  enabled: z.boolean(),
  capabilities: z.unknown(),
});
export const breakerStateSchema = z.enum(['closed', 'open', 'half_open']);
export const providerHealthSchema = z.object({
  provider: z.string(),
  breaker_state: breakerStateSchema,
});
export const sectionTagSchema = z.enum([
  '[Verse]',
  '[Chorus]',
  '[Bridge]',
  '[Outro]',
]);
export const lyricsSchema = z.strictObject({
  title: z.string().min(1),
  language: z.enum(['tr', 'en']),
  sections: z
    .array(
      z.strictObject({
        tag: sectionTagSchema,
        lines: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
  suggestedStyle: z.string().min(1),
});
export const mockLyricRequestSchema = z.strictObject({
  language: z.enum(['tr', 'en']),
  description: z.string(),
  occasion: z.enum(['birthday', 'anniversary', 'general']).default('general'),
  giftNames: z.array(z.string().min(1)).default([]),
});
export const moderationActionSchema = z.enum([
  'allow',
  'allow_explicit',
  'block',
  'hard_block',
]);
export const policyCategorySchema = z.enum([
  'minor_sexual',
  'threat',
  'terrorism',
  'private_data',
  'sexual_explicit',
  'hate',
  'harassment',
  'self_harm',
  'serious_crime',
  'artist_impersonation',
  'copyrighted_lyrics',
  'spam',
  'explicit',
  'none',
]);
export type PolicyCategory = z.infer<typeof policyCategorySchema>;
export type ModerationAction = z.infer<typeof moderationActionSchema>;
export function tierOf(category: PolicyCategory): ModerationAction {
  switch (category) {
    case 'minor_sexual':
    case 'threat':
    case 'terrorism':
    case 'private_data':
      return 'hard_block';
    case 'explicit':
      return 'allow_explicit';
    case 'none':
      return 'allow';
    default:
      return 'block';
  }
}
export const classifierOutputSchema = z.strictObject({
  category: policyCategorySchema,
  severity: z.enum(['none', 'low', 'high', 'critical']),
  evidence: z.array(z.string().max(200)).max(3),
  confidence: z.number().min(0).max(1),
});
