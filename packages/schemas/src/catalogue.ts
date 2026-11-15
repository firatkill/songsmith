import { z } from 'zod';
import {
  catalogueRowSchema,
  musicCapabilitiesSchema,
  operationSchema,
} from './providers.js';

export const languageStatusSchema = z.enum(['unverified', 'beta', 'verified']);
export const catalogueModelSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  qualityRank: z.number().int(),
  capabilities: musicCapabilitiesSchema,
  prices: z.partialRecord(operationSchema, z.number().int().nonnegative()),
  languages: z.record(z.string().min(1), languageStatusSchema),
  available: z.boolean(),
});
export type CatalogueModel = z.infer<typeof catalogueModelSchema>;
export const catalogueSchema = z.object({
  models: z.array(catalogueModelSchema),
});
export const routerReasonCodeSchema = z.enum([
  'cannot_generate',
  'cannot_instrumental',
  'cannot_custom_lyrics',
  'cannot_extend',
  'cannot_stems',
  'cannot_image_input',
  'language_unverified',
  'unavailable',
  'no_price',
  'not_source_model',
  'no_external_audio',
  'unknown_model',
]);
export type RouterReasonCode = z.infer<typeof routerReasonCodeSchema>;

// Database join used by the registry; provider costs never enter the public view.
export const registryCatalogueRowSchema = catalogueRowSchema.extend({
  display_name: z.string().min(1),
  quality_rank: z.number().int(),
  model_prices: z.array(
    z.object({
      // Internal adapters may price non-music operations such as lyrics.
      operation: z.string().min(1),
      credits: z.number().int().nonnegative(),
    }),
  ),
  model_languages: z.array(
    z.object({ language: z.string().min(1), status: languageStatusSchema }),
  ),
});
