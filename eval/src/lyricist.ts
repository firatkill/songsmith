import { randomUUID } from 'node:crypto';
import { lyricsSchema, sectionTagSchema } from '@songsmith/schemas';
import {
  AppError,
  languageMatches,
  nameMissing,
  writeLyrics,
  type TextAdapter,
} from '@songsmith/backend/eval';
import type { Budget } from './budget.js';
import type { LyricistRow } from './golden.js';
import { guarded } from './moderation.js';

export interface LyricistThresholds {
  sectionTags: number;
  language: number;
  giftNames: number;
}
export interface LyricistResult {
  id: string;
  valid: boolean;
  tagsOk: boolean;
  languageOk: boolean;
  namesOk: boolean | null;
}

// Rows run through the real lyricist module (T-18): validation and the repair
// attempt included. A row whose lyrics still fail validation is invalid.
export async function runLyricist(options: {
  rows: LyricistRow[];
  model: TextAdapter;
  budget?: Budget;
}): Promise<LyricistResult[]> {
  const adapter = guarded(options.model, options.budget);
  const results: LyricistResult[] = [];
  for (const row of options.rows) {
    const output = await writeLyrics(
      {
        adapter,
        ctx: {
          userId: '00000000-0000-4000-8000-000000000000',
          jobId: randomUUID(),
          correlationId: randomUUID(),
          signal: AbortSignal.timeout(60_000),
        },
      },
      {
        task: 'write',
        language: row.lang,
        description: row.description,
        occasion: row.occasion,
        giftNames: row.giftNames,
      },
    )
      .then((r) => lyricsSchema.safeParse(r.lyrics))
      .catch((error: unknown) => {
        if (error instanceof AppError) return undefined; // LYRICS_INVALID
        throw error;
      });
    if (!output?.success) {
      results.push({
        id: row.id,
        valid: false,
        tagsOk: false,
        languageOk: false,
        namesOk: row.giftNames.length ? false : null,
      });
      continue;
    }
    const lyrics = output.data;
    const text = lyrics.sections.flatMap((s) => s.lines).join('\n');
    results.push({
      id: row.id,
      valid: true,
      tagsOk: lyrics.sections.every(
        (s) => sectionTagSchema.safeParse(s.tag).success,
      ),
      languageOk:
        lyrics.language === row.lang && languageMatches(text, row.lang),
      namesOk: row.giftNames.length
        ? row.giftNames.every((name) => !nameMissing(text, name, row.lang))
        : null,
    });
  }
  return results;
}

const ratio = (n: number, d: number) => (d === 0 ? 1 : n / d);
export function lyricistMetrics(
  results: LyricistResult[],
  thresholds: LyricistThresholds,
) {
  const named = results.filter((r) => r.namesOk !== null);
  const sectionTags = ratio(
    results.filter((r) => r.tagsOk).length,
    results.length,
  );
  const language = ratio(
    results.filter((r) => r.languageOk).length,
    results.length,
  );
  const giftNames = ratio(named.filter((r) => r.namesOk).length, named.length);
  return {
    rows: results.length,
    sectionTags,
    language,
    giftNames,
    misses: results
      .filter(
        (r) => !r.valid || !r.tagsOk || !r.languageOk || r.namesOk === false,
      )
      .map((r) => ({
        id: r.id,
        valid: r.valid,
        tags: r.tagsOk,
        language: r.languageOk,
        names: r.namesOk,
      })),
    thresholds,
    passed:
      sectionTags >= thresholds.sectionTags &&
      language >= thresholds.language &&
      giftNames >= thresholds.giftNames,
  };
}
export type LyricistMetrics = ReturnType<typeof lyricistMetrics>;
