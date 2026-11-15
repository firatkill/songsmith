import { z } from 'zod';
import {
  lyricLanguageSchema,
  lyricSectionSchema,
  lyricsSchema,
  occasionSchema,
} from './providers.js';
import { creditJobSchema } from './credits.js';

const text = (max: number) => z.string().trim().min(1).max(max);
const line = z.string().trim().min(1).max(200);
export const editorSectionSchema = lyricSectionSchema.extend({
  lines: z.array(line).min(1).max(60),
});
export const lyricsWriteRequestSchema = z.strictObject({
  language: lyricLanguageSchema,
  description: text(2000),
  style: text(200).optional(),
  occasion: occasionSchema.optional(),
  giftNames: z.array(text(40)).max(5).optional(),
});
export type LyricsWriteRequest = z.infer<typeof lyricsWriteRequestSchema>;
export const lyricsRewriteRequestSchema = z
  .strictObject({
    language: lyricLanguageSchema,
    sections: z.array(editorSectionSchema).min(1).max(20),
    index: z.number().int().nonnegative(),
    instruction: text(300).optional(),
  })
  .refine((v) => v.index < v.sections.length, { path: ['index'] });
export type LyricsRewriteRequest = z.infer<typeof lyricsRewriteRequestSchema>;
export const lyricsWriteResponseSchema = z.strictObject({
  jobId: z.uuid(),
  lyrics: lyricsSchema,
  explicit: z.boolean(),
});
export const lyricsRewriteResponseSchema = z.strictObject({
  jobId: z.uuid(),
  section: lyricSectionSchema,
  explicit: z.boolean(),
});
// Stored in generation_jobs.steps so an Idempotency-Key replay returns the
// first result without another model call or charge (TRD §9).
export const lyricsJobStepsSchema = z.object({
  lyricist: z
    .object({
      bodySha256: z.string().regex(/^[a-f0-9]{64}$/),
      result: z.unknown().optional(),
    })
    .optional(),
});
export const idempotencyHeadersSchema = z.object({
  'idempotency-key': z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,128}$/)
    .describe('Unique per request; a replay returns the first result.'),
});
export const lyricistJobSchema = creditJobSchema.extend({
  steps: lyricsJobStepsSchema,
  error_code: z.string().nullable(),
});
