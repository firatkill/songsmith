import { artists } from '../lists/artists.js';
import {
  minorIndicators,
  sexualContext,
  numberWordsEn,
  numberWordsTr,
} from '../lists/context.js';
import { hardBlockEn } from '../lists/hard-block.en.js';
import { hardBlockTr } from '../lists/hard-block.tr.js';
import { normalise, matchingText } from './normalise.js';
import { sha256 } from './sha256.js';
export { normalise } from './normalise.js';
export type DeterministicCategory = 'minor_sexual' | 'artist_impersonation';
export type RuleId =
  'hard_block_term' | 'age_sexual_cooccurrence' | 'artist_voice';
export interface DeterministicResult {
  action: 'pass' | 'block' | 'hard_block';
  hits: Array<{ rule: RuleId; category: DeterministicCategory }>;
}
export interface RuleLists {
  hardBlockEn: readonly string[];
  hardBlockTr: readonly string[];
  minorIndicators: readonly string[];
  sexualContext: readonly string[];
  artists: readonly string[];
}
const defaults: RuleLists = {
  hardBlockEn,
  hardBlockTr,
  minorIndicators,
  sexualContext,
  artists,
};
const hashTerm = (tokens: readonly string[]): string =>
  sha256('songsmith-mr-v1:' + tokens.join(''));
type Span = { start: number; end: number };
function occurrences(
  tokens: readonly string[],
  phrases: readonly string[],
): Span[] {
  const spans: Span[] = [];
  for (const phrase of phrases) {
    const wanted = normalise(phrase).tokens;
    if (!wanted.length) continue;
    for (let i = 0; i <= tokens.length - wanted.length; i++) {
      if (wanted.every((word, j) => tokens[i + j] === word))
        spans.push({ start: i, end: i + wanted.length - 1 });
    }
  }
  return spans;
}
// Recognise ages before leetspeak folding, with whole-number boundaries.
function minorAgeSpans(text: string): Span[] {
  const minorWords = [...numberWordsEn, ...numberWordsTr].map(
    (word) => normalise(word).skeleton,
  );
  const adultWords =
    'eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand on yirmi otuz kırk elli altmış yetmiş seksen doksan yüz bin';
  const words = [
    ...new Set([
      ...minorWords.flatMap((word) => word.split(' ')),
      ...normalise(adultWords).tokens,
    ]),
  ].join('|');
  const source = matchingText(normalise(text).folded).replace(/[-‐‑–—]/gu, ' ');
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])([0-9]+|(?:${words})(?:\\s+(?:${words}))*)\\s*(?:years?\\s+old|yo|yas(?:indaki|inda))(?![\\p{L}\\p{N}])`,
    'gu',
  );
  const spans: Span[] = [];
  for (const match of source.matchAll(pattern)) {
    const age = match[1] ?? '';
    const isMinor = /^[0-9]+$/.test(age)
      ? Number(age) < 18
      : minorWords.includes(age.replace(/\s+/gu, ' '));
    if (isMinor) {
      const start = normalise(source.slice(0, match.index)).tokens.length;
      spans.push({ start, end: start + normalise(match[0]).tokens.length - 1 });
    }
  }
  return spans;
}
export function checkDeterministic(
  text: string,
  options: { lists?: Partial<RuleLists> } = {},
): DeterministicResult {
  const lists = { ...defaults, ...options.lists };
  const { tokens, skeleton } = normalise(text);
  const hits: DeterministicResult['hits'] = [];
  const hashes = new Set([...lists.hardBlockEn, ...lists.hardBlockTr]);
  let termHit = false;
  for (let i = 0; i < tokens.length && !termHit; i++) {
    for (let size = 1; size <= 4 && i + size <= tokens.length; size++) {
      if (hashes.has(hashTerm(tokens.slice(i, i + size)))) {
        termHit = true;
        break;
      }
    }
  }
  if (termHit) hits.push({ rule: 'hard_block_term', category: 'minor_sexual' });
  const minors = [
    ...occurrences(tokens, lists.minorIndicators),
    ...minorAgeSpans(text),
  ];
  const contexts = occurrences(tokens, lists.sexualContext);
  if (
    minors.some((minor) =>
      contexts.some(
        (context) =>
          Math.max(minor.end, context.end) -
            Math.min(minor.start, context.start) +
            1 <=
          12,
      ),
    )
  ) {
    hits.push({ rule: 'age_sexual_cooccurrence', category: 'minor_sexual' });
  }
  const english = [
    'in the voice of',
    'sounding like',
    'sing like',
    'in the style of',
  ];
  const turkish = ['tarzında', 'gibi söyle', 'sesiyle'];
  const requests = lists.artists.flatMap((artist) => [
    ...english.map((prefix) => `${prefix} ${artist}`),
    ...turkish.map((suffix) => `${artist} ${suffix}`),
    ...['in', 'ın', 'un', 'ün', 'nin', 'nın', 'nun', 'nün'].map(
      (suffix) => `${artist}'${suffix} sesiyle`,
    ),
  ]);
  if (occurrences(skeleton.split(' '), requests).length)
    hits.push({ rule: 'artist_voice', category: 'artist_impersonation' });
  return {
    action: hits.some((hit) => hit.category === 'minor_sexual')
      ? 'hard_block'
      : hits.length
        ? 'block'
        : 'pass',
    hits,
  };
}
