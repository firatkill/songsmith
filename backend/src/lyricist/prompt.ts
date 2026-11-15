import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { LYRICIST_REPAIR_PREFIX, type LyricistData } from '@songsmith/schemas';
export const LYRICIST_PROMPT_VERSION = 'v1';
const load = (name: string) =>
  readFileSync(
    new URL(`./prompts/${name}.${LYRICIST_PROMPT_VERSION}.md`, import.meta.url),
    'utf8',
  );
const prompts = {
  create: load('create'),
  rewrite: load('rewrite-section'),
  birthday: load('gift-birthday'),
  anniversary: load('gift-anniversary'),
  general: load('gift-general'),
};
export function systemPromptFor(data: LyricistData) {
  if (data.task === 'rewrite') return prompts.rewrite;
  return data.giftNames.length ? prompts[data.occasion] : prompts.create;
}
// User input is JSON data inside a per-call random boundary (SEC-08), as in
// the moderation prompt. A repair note never contains user text.
export function buildLyricistPromptWith(
  data: LyricistData,
  boundary: string,
  repair?: string,
) {
  const json = JSON.stringify(data).replaceAll(boundary, '[boundary removed]');
  return {
    system: systemPromptFor(data),
    user: [
      `The request is the JSON between BEGIN ${boundary} and END ${boundary}.`,
      `BEGIN ${boundary}`,
      json,
      `END ${boundary}`,
      ...(repair
        ? [
            `${LYRICIST_REPAIR_PREFIX} ${repair} Answer again with valid JSON that follows every rule.`,
          ]
        : []),
    ].join('\n'),
    boundary,
  };
}
export function buildLyricistPrompt(data: LyricistData, repair?: string) {
  return buildLyricistPromptWith(
    data,
    `songsmith_data_${randomBytes(24).toString('hex')}`,
    repair,
  );
}
