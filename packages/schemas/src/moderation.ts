import { z } from 'zod';
import { moderationActionSchema, policyCategorySchema } from './providers.js';
export const pipelineCategorySchema = z.union([
  policyCategorySchema,
  z.literal('classifier_error'),
]);
export const inputSurfaceSchema = z.enum([
  'description',
  'lyrics',
  'style',
  'rewrite_instruction',
  'cover_instruction',
  'gift',
  'title',
  'profile',
]);
export const moderationSurfaceSchema = z.enum([
  ...inputSurfaceSchema.options,
  'output_lyrics',
  'output_image',
  'output_transcript',
]);
const partSchema = z.strictObject({
  surface: moderationSurfaceSchema,
  text: z.string().min(1).max(12000),
});
export const moderationInputSchema = z
  .strictObject({
    parts: z.array(partSchema).min(1).max(6),
    language: z
      .string()
      .regex(/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/)
      .max(64)
      .optional(),
    userId: z.uuid(),
  })
  .refine((v) => v.parts.reduce((n, p) => n + p.text.length, 0) <= 12000, {
    path: ['parts'],
  });
export type ModerationInput = z.infer<typeof moderationInputSchema>;
export const moderationCheckSchema = z
  .strictObject({
    parts: z
      .array(partSchema.extend({ surface: inputSurfaceSchema }))
      .min(1)
      .max(6),
    language: z
      .string()
      .regex(/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/)
      .max(64)
      .optional(),
  })
  .refine((v) => v.parts.reduce((n, p) => n + p.text.length, 0) <= 12000, {
    path: ['parts'],
  });
export const decisionSchema = z.strictObject({
  decisionId: z.uuid(),
  action: moderationActionSchema,
  category: pipelineCategorySchema,
  explicit: z.boolean(),
  cached: z.boolean(),
});
export type Decision = z.infer<typeof decisionSchema>;
export const moderationCheckResponseSchema = z.discriminatedUnion('action', [
  z.strictObject({
    decisionId: z.uuid(),
    action: z.literal('block'),
    category: pipelineCategorySchema,
    explicit: z.literal(false),
  }),
  z.strictObject({
    decisionId: z.uuid(),
    action: z.enum(['allow', 'hard_block']),
    explicit: z.literal(false),
  }),
  z.strictObject({
    decisionId: z.uuid(),
    action: z.literal('allow_explicit'),
    explicit: z.literal(true),
  }),
]);
export const restrictionSchema = z.object({
  status: z.enum(['active', 'cooldown', 'suspended', 'banned', 'deleted']),
  cooldown_until: z.iso.datetime({ offset: true }).nullable(),
});
export const recordedModerationSchema = z.object({
  decision_id: z.uuid(),
  case_id: z.uuid().nullable(),
});
export const cachedModerationSchema = z.object({
  id: z.uuid(),
  action: moderationActionSchema,
  category: pipelineCategorySchema,
});
