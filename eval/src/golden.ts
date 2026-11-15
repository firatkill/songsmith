import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  inputSurfaceSchema,
  moderationActionSchema,
  policyCategorySchema,
} from '@songsmith/schemas';

export const langSchema = z.enum(['tr', 'en']);
// TRD §10.4. Markers are added by the harness in mock mode, never stored.
export const moderationRowSchema = z.strictObject({
  id: z.string().regex(/^mod-(tr|en)-[a-z_]+-\d{3}$/u),
  lang: langSchema,
  surface: inputSurfaceSchema,
  text: z
    .string()
    .min(1)
    .max(2000)
    .refine(
      (text) => !text.includes('⟦mock:'),
      'markers are added at run time',
    ),
  expected_action: moderationActionSchema,
  expected_category: policyCategorySchema,
  tags: z.array(z.string().min(1)),
});
export type ModerationRow = z.infer<typeof moderationRowSchema>;

export const lyricistRowSchema = z.strictObject({
  id: z.string().regex(/^lyr-(tr|en)-\d{3}$/u),
  lang: langSchema,
  occasion: z.enum(['birthday', 'anniversary', 'general']),
  description: z.string().min(1).max(500),
  giftNames: z.array(z.string().min(1)).max(4),
});
export type LyricistRow = z.infer<typeof lyricistRowSchema>;

export function readJsonl<T>(url: URL, schema: z.ZodType<T>): T[] {
  const rows = readFileSync(url, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, i) => {
      const parsed = schema.safeParse(JSON.parse(line));
      if (!parsed.success)
        throw new Error(
          `${url.pathname}:${String(i + 1)} ${parsed.error.message}`,
        );
      return parsed.data;
    });
  return rows;
}

export const goldenFiles = {
  moderation: new URL('../moderation/golden.jsonl', import.meta.url),
  lyricist: new URL('../lyricist/golden.jsonl', import.meta.url),
};
