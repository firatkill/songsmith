import { z } from 'zod';
import { lyricLanguageSchema } from './providers.js';
import { routerReasonCodeSchema } from './catalogue.js';
import { editorSectionSchema } from './lyrics.js';

const text = (max: number) => z.string().trim().min(1).max(max);
// FR-05 style controls. Curated ids; labels live in packages/i18n. A genre
// that is not curated is sent as free text in `genre` and moderated.
export const curatedGenres = [
  'pop',
  'rock',
  'hiphop',
  'rnb',
  'electronic',
  'acoustic',
  'jazz',
  'classical',
  'folk',
  'turkish_pop',
  'arabesque',
  'anatolian_rock',
] as const;
export const moodSchema = z.enum([
  'happy',
  'romantic',
  'sad',
  'calm',
  'energetic',
  'nostalgic',
  'epic',
]);
export const tempoSchema = z.enum(['slow', 'medium', 'fast']);
export const vocalTypeSchema = z.enum(['female', 'male', 'duet', 'choir']);
export const styleControlsSchema = z.strictObject({
  genre: text(60).optional(),
  mood: moodSchema.optional(),
  tempo: tempoSchema.optional(),
  bpm: z.number().int().min(40).max(220).optional(),
  vocalType: vocalTypeSchema.optional(),
});
export type StyleControls = z.infer<typeof styleControlsSchema>;
// POST /v1/songs (FR-08). Lyrics come from the editor as sections; an
// instrumental song has none. modelId is the Advanced manual choice (FR-28).
// My lyrics mode has no description (FR-01); an instrumental song needs one
// because the description drives the music (FR-06).
export const songCreateRequestSchema = z
  .strictObject({
    title: text(120),
    description: text(2000).optional(),
    language: lyricLanguageSchema,
    instrumental: z.boolean().default(false),
    sections: z.array(editorSectionSchema).max(20).optional(),
    style: text(200).optional(),
    styleControls: styleControlsSchema.optional(),
    durationSec: z.number().int().min(30).max(300).default(120),
    modelId: z.string().min(1).max(64).optional(),
  })
  .refine((v) => v.instrumental || (v.sections?.length ?? 0) > 0, {
    path: ['sections'],
  })
  .refine((v) => !v.instrumental || v.description !== undefined, {
    path: ['description'],
  })
  .refine((v) => !v.instrumental || v.styleControls?.vocalType === undefined, {
    path: ['styleControls', 'vocalType'],
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
  // T-20: the provider style string built from the controls; older jobs lack it.
  style: z.string().optional(),
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
