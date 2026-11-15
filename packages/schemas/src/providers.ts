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
// FR-02: the six section tags the lyricist writes and the editors accept.
export const sectionTagSchema = z.enum([
  '[Intro]',
  '[Verse]',
  '[Pre-Chorus]',
  '[Chorus]',
  '[Bridge]',
  '[Outro]',
]);
export type SectionTag = z.infer<typeof sectionTagSchema>;
export const lyricSectionSchema = z.strictObject({
  tag: sectionTagSchema,
  lines: z.array(z.string().min(1)).min(1),
});
export type LyricSection = z.infer<typeof lyricSectionSchema>;
export const lyricsSchema = z.strictObject({
  title: z.string().min(1),
  language: z.enum(['tr', 'en']),
  sections: z.array(lyricSectionSchema).min(1),
  suggestedStyle: z.string().min(1),
});
export const lyricLanguageSchema = z.enum(['tr', 'en']);
export type LyricLanguage = z.infer<typeof lyricLanguageSchema>;
export const occasionSchema = z.enum(['birthday', 'anniversary', 'general']);
// The data block the lyricist sends to the text model (T-18). The mock text
// adapter reads the same shape, so real prompts work against the mock.
export const lyricistDataSchema = z.discriminatedUnion('task', [
  z.strictObject({
    task: z.literal('write'),
    language: lyricLanguageSchema,
    description: z.string(),
    style: z.string().optional(),
    occasion: occasionSchema.default('general'),
    giftNames: z.array(z.string().min(1)).default([]),
  }),
  z.strictObject({
    task: z.literal('rewrite'),
    language: lyricLanguageSchema,
    sections: z.array(lyricSectionSchema).min(1),
    index: z.number().int().nonnegative(),
    instruction: z.string().optional(),
  }),
]);
export type LyricistData = z.infer<typeof lyricistDataSchema>;
// Starts the repair note the lyricist appends after an invalid answer.
export const LYRICIST_REPAIR_PREFIX = 'Your previous answer was invalid:';
// Model output before validation: tags are checked by the lyricist so an
// invalid tag leads to the repair attempt instead of a provider error.
export const rawSectionSchema = z.strictObject({
  tag: z.string().min(1).max(40),
  lines: z.array(z.string().min(1).max(400)).min(1).max(80),
});
export const rawLyricsSchema = z.strictObject({
  title: z.string().min(1).max(200),
  language: z.string().min(1).max(16),
  sections: z.array(rawSectionSchema).min(1).max(30),
  suggestedStyle: z.string().min(1).max(400),
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
