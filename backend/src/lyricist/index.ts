import { z } from 'zod';
import {
  lyricistDataSchema,
  lyricsSchema,
  lyricSectionSchema,
  rawLyricsSchema,
  rawSectionSchema,
  type LyricistData,
  type LyricLanguage,
  type LyricSection,
} from '@songsmith/schemas';
import { validateSections } from '@songsmith/domain';
import { AppError } from '../lib/errors.js';
import { ProviderError } from '../providers/errors.js';
import type { ProviderContext, TextAdapter } from '../providers/types.js';
import { languageMatches } from './language.js';
import { buildLyricistPrompt } from './prompt.js';
export { LYRICIST_PROMPT_VERSION } from './prompt.js';

type Lyrics = z.infer<typeof lyricsSchema>;
export type WriteInput = Extract<LyricistData, { task: 'write' }>;
export type RewriteInput = Extract<LyricistData, { task: 'rewrite' }>;
export interface LyricistCall {
  adapter: TextAdapter;
  ctx: ProviderContext;
  onCost?: (costMicroUsd: number | null) => void;
}

// Validation messages go back to the model in the repair attempt, so they
// name problems and positions only, never user text (SEC-08, SEC-11).
function sectionProblems(
  sections: ReadonlyArray<{ tag: string; lines: readonly string[] }>,
) {
  return validateSections(sections).map((issue) =>
    issue.problem === 'unknown_tag'
      ? `Section ${String(issue.index + 1)} uses a tag that is not allowed.`
      : `Section ${String(issue.index + 1)} has no lines.`,
  );
}
function withoutNames(text: string, names: readonly string[]) {
  return names.reduce((t, name) => t.replaceAll(name, ' '), text);
}
export function nameMissing(
  text: string,
  name: string,
  language: LyricLanguage,
) {
  return !text
    .toLocaleLowerCase(language)
    .includes(name.toLocaleLowerCase(language));
}
export function validateLyrics(
  value: z.infer<typeof rawLyricsSchema>,
  data: WriteInput,
): { ok: true; lyrics: Lyrics } | { ok: false; problems: string[] } {
  const problems = sectionProblems(value.sections);
  if (value.language !== data.language)
    problems.push(`The language field must be "${data.language}".`);
  const text = value.sections.flatMap((s) => s.lines).join('\n');
  if (!languageMatches(withoutNames(text, data.giftNames), data.language))
    problems.push(`The lines are not written in "${data.language}".`);
  const missing = data.giftNames.filter((name) =>
    nameMissing(text, name, data.language),
  ).length;
  if (missing)
    problems.push(
      `${String(missing)} of the requested names do not appear in the lines.`,
    );
  const parsed = lyricsSchema.safeParse(value);
  if (problems.length || !parsed.success)
    return {
      ok: false,
      problems: problems.length ? problems : ['The answer is not valid.'],
    };
  return { ok: true, lyrics: parsed.data };
}
export function validateSection(
  value: z.infer<typeof rawSectionSchema>,
  data: RewriteInput,
): { ok: true; section: LyricSection } | { ok: false; problems: string[] } {
  const problems = sectionProblems([value]);
  if (!languageMatches(value.lines.join('\n'), data.language))
    problems.push(`The lines are not written in "${data.language}".`);
  const parsed = lyricSectionSchema.safeParse(value);
  if (problems.length || !parsed.success)
    return {
      ok: false,
      problems: problems.length ? problems : ['The answer is not valid.'],
    };
  return { ok: true, section: parsed.data };
}

// An unparsable or schema-invalid answer is an invalid output, not an outage.
function isInvalidOutput(error: unknown) {
  return (
    error instanceof z.ZodError ||
    error instanceof SyntaxError ||
    (error instanceof ProviderError && error.code === 'invalid_request')
  );
}

async function withRepair<R, T>(
  call: LyricistCall,
  data: LyricistData,
  schema: z.ZodType<R>,
  validate: (
    value: R,
  ) => { ok: true; value: T } | { ok: false; problems: string[] },
): Promise<{ value: T; attempts: number }> {
  let repair: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = buildLyricistPrompt(data, repair);
    try {
      const result = await call.adapter.completeJson(
        {
          system: prompt.system,
          user: prompt.user,
          schema,
          maxTokens: 4000,
        },
        call.ctx,
      );
      call.onCost?.(result.costMicroUsd);
      const checked = validate(schema.parse(result.value));
      if (checked.ok) return { value: checked.value, attempts: attempt };
      repair = checked.problems.join(' ');
    } catch (error) {
      if (!isInvalidOutput(error)) throw error;
      repair = 'The answer was not valid JSON in the requested shape.';
    }
  }
  throw new AppError('LYRICS_INVALID');
}

export async function writeLyrics(call: LyricistCall, input: WriteInput) {
  const data = lyricistDataSchema.parse(input) as WriteInput;
  const { value, attempts } = await withRepair(
    call,
    data,
    rawLyricsSchema,
    (raw) => {
      const checked = validateLyrics(raw, data);
      return checked.ok
        ? { ok: true, value: checked.lyrics }
        : { ok: false, problems: checked.problems };
    },
  );
  return { lyrics: value, attempts };
}

export async function rewriteSection(call: LyricistCall, input: RewriteInput) {
  const data = lyricistDataSchema.parse(input) as RewriteInput;
  if (data.index >= data.sections.length) throw new AppError('VALIDATION');
  const { value, attempts } = await withRepair(
    call,
    data,
    rawSectionSchema,
    (raw) => {
      const checked = validateSection(raw, data);
      return checked.ok
        ? { ok: true, value: checked.section }
        : { ok: false, problems: checked.problems };
    },
  );
  return { section: value, attempts };
}
