import { z } from 'zod';
import { lyricLanguageSchema } from './providers.js';
import { routerReasonCodeSchema } from './catalogue.js';
import { editorSectionSchema } from './lyrics.js';

const text = (max: number) => z.string().trim().min(1).max(max);
// POST /v1/songs (FR-08). Lyrics come from the editor as sections; an
// instrumental song has none. modelId is the Advanced manual choice (FR-28).
export const songCreateRequestSchema = z
  .strictObject({
    title: text(120),
    description: text(2000),
    language: lyricLanguageSchema,
    instrumental: z.boolean().default(false),
    sections: z.array(editorSectionSchema).max(20).optional(),
    style: text(200).optional(),
    durationSec: z.number().int().min(30).max(300).default(120),
    modelId: z.string().min(1).max(64).optional(),
  })
  .refine((v) => v.instrumental || (v.sections?.length ?? 0) > 0, {
    path: ['sections'],
  });
export type SongCreateRequest = z.infer<typeof songCreateRequestSchema>;
export const jobStatusSchema = z.enum([
  'queued',
  'moderating',
  'running',
  'finishing',
  'ready',
  'failed',
  'refunded',
  'cancelled',
]);
export const routeReasonSchema = z
  .object({
    kind: z.enum(['auto', 'manual', 'source']),
    differentModel: z.boolean().optional(),
    fallbackFrom: z.string().optional(),
  })
  .loose();
export const jobResponseSchema = z.strictObject({
  jobId: z.uuid(),
  songId: z.uuid().nullable(),
  operation: z.string(),
  status: jobStatusSchema,
  stageDetail: z.string().nullable(),
  modelId: z.string().nullable(),
  routeReason: routeReasonSchema.or(z.strictObject({})),
  errorCode: z.string().nullable(),
});
export type JobResponse = z.infer<typeof jobResponseSchema>;
export const modelNotEligibleDetailsSchema = z.object({
  perModel: z.record(z.string(), routerReasonCodeSchema),
});
// The request stored in generation_jobs.steps.request; the worker builds the
// provider request from it (Redis only carries IDs, SEC-11).
export const songJobRequestSchema = z.object({
  description: z.string(),
  lyrics: z.string(),
  language: lyricLanguageSchema,
  instrumental: z.boolean(),
  durationSec: z.number().int().positive(),
  title: z.string(),
});
export const songJobRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  operation: z.string(),
  status: jobStatusSchema,
  song_id: z.uuid().nullable(),
  model_id: z.string().nullable(),
  route_reason: z.record(z.string(), z.json()),
  reservation_id: z.uuid().nullable(),
  error_code: z.string().nullable(),
  stage_detail: z.string().nullable(),
  steps: z
    .object({
      bodySha256: z.string().optional(),
      request: songJobRequestSchema.optional(),
    })
    .loose(),
});
export type SongJobRow = z.infer<typeof songJobRowSchema>;
