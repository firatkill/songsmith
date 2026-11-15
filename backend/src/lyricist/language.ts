import { franc } from 'franc-min';
import type { LyricLanguage } from '@songsmith/schemas';
// NFR-13: a cheap detector restricted to the supported languages. Texts too
// short to judge (fewer than 40 letters) count as matching.
const ISO: Record<string, LyricLanguage> = { tur: 'tr', eng: 'en' };
export const MIN_LETTERS = 40;
export function detectLanguage(text: string): LyricLanguage | undefined {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters < MIN_LETTERS) return undefined;
  return ISO[franc(text, { only: ['tur', 'eng'], minLength: MIN_LETTERS })];
}
export function languageMatches(text: string, language: LyricLanguage) {
  const detected = detectLanguage(text);
  return detected === undefined || detected === language;
}
