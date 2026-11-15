import { describe, expect, it } from 'vitest';
import { checkDeterministic, normalise } from './index.js';
import { sha256 } from './sha256.js';
import { hardBlockEn } from '../lists/hard-block.en.js';
import { hardBlockTr } from '../lists/hard-block.tr.js';
import { numberWordsEn, numberWordsTr } from '../lists/context.js';
import { artists } from '../lists/artists.js';
const sentinel = 'forbiddensentinel';
const lists = {
  hardBlockEn: [sha256('songsmith-mr-v1:' + sentinel)],
  hardBlockTr: [],
};

describe('normalisation UT-30..33', () => {
  it.each([
    ['ch1ld', 'child'],
    ['c0cuk', 'cocuk'],
    ['$3xy', 'sexy'],
    ['c h i l d', 'child'],
    ['c.h.i.l.d', 'child'],
    ['c-h-i-l-d', 'child'],
    ['çocuk', 'cocuk'],
    ['ÇOCUK', 'cocuk'],
    ['сhild', 'child'],
    ['cоcuk', 'cocuk'],
    ['cοcuk', 'cocuk'],
    ['chiiiild', 'chiild'],
    ['ｃｈｉｌｄ', 'child'],
  ])('%s skeleton', (text, expected) => {
    expect(normalise(text).skeleton).toBe(expected);
  });
  it.each([
    '\u200b',
    '\u200c',
    '\u200d',
    '\u200e',
    '\u200f',
    '\u2060',
    '\u2061',
    '\u2062',
    '\u2063',
    '\u2064',
    '\ufeff',
    '\u00ad',
    '\u0301',
  ])('UT-31 invisible %j', (char) => {
    expect(normalise(`ch${char}ild`).skeleton).toBe('child');
  });
  it('UT-33 preserves Turkish folded text and digits', () => {
    expect(normalise('İSTANBUL').folded).toBe('istanbul');
    expect(normalise('IŞIK').folded).toBe('ışık');
    expect(normalise('IŞIK').skeleton).toBe('isik');
    expect(normalise('  12\n yaşında ').folded).toBe('12 yaşında');
    expect(normalise('')).toEqual({ folded: '', skeleton: '', tokens: [] });
  });
});
it.each([
  sentinel,
  'f0rb1dd3ns3nt1n3l',
  sentinel.split('').join(' '),
  sentinel.split('').join('.'),
  'forbid\u200b densentinel',
  'fоrbiddensentinel',
  'FORBIDDENSENTINEL',
  `please ${sentinel} today`,
])('UT-34 sentinel evasion %s', (text) => {
  expect(checkDeterministic(text, { lists }).action).toBe('hard_block');
});
it('hashes only complete windows of at most four tokens', () => {
  expect(checkDeterministic('for bid den sentinel', { lists }).action).toBe(
    'hard_block',
  );
  expect(checkDeterministic('for bid den sent inel', { lists }).action).toBe(
    'pass',
  );
  expect(
    checkDeterministic('prefixforbiddensentinelsuffix', { lists }).action,
  ).toBe('pass');
});
it.each([
  'child sexual',
  'ch1ld $3xy',
  'сhild erotic',
  'c h i l d nude',
  'ÇOCUK cinsel',
  'c0cuk seksi',
  'küçük kız erotik',
  'ortaokul öğrencisi çıplak',
  '12 yaşında cinsel',
  '12 yaşındaki cinsel',
  '12 years old sexual',
  '12yo sexual',
  'twelve-year-old sexual',
  'on iki yaşında cinsel',
  'child cinsel',
])('UT-35 context %s', (text) => {
  expect(checkDeterministic(text).action).toBe('hard_block');
});
it.each(Array.from({ length: 18 }, (_, n) => n))(
  'UT-35 age %i in both languages',
  (age) => {
    for (const text of [
      `${String(age)} years old sexual`,
      `${String(age)} yaşındaki cinsel`,
      `${numberWordsEn[age] ?? ''}-year-old sexual`,
      `${numberWordsTr[age] ?? ''} yaşında cinsel`,
    ])
      expect(checkDeterministic(text).action).toBe('hard_block');
  },
);
it.each([
  '18 years old sexual',
  '25yo sexy',
  '18 yaşında cinsel',
  '25 yaşındaki seksi',
  '118 years old sexual',
  '111 years old sexual',
  'eighteen-year-old sexual',
  'on sekiz yaşında cinsel',
  'twenty one years old sexual',
  'yirmi beş yaşında cinsel',
  'birthday song for my 7-year-old',
  'çocuk için doğum günü',
  'damn hell',
  'lan',
  'pop rock jazz',
  'in the voice of Unlisted Person',
  'Tarkan is popular',
  'sexual childhood',
])('UT-35/36 passes %s', (text) => {
  expect(checkDeterministic(text).action).toBe('pass');
});
it.each([
  'a sexy song in A minor',
  'sexy minor chords',
  'sexy minor chords for my band',
  'seductive minor key ballad',
  'seksi bir minör şarkı',
])('UT-35 musical minor passes: %s', (text) => {
  expect(checkDeterministic(text)).toEqual({ action: 'pass', hits: [] });
});
it('12-token window includes both indicators and works in either order', () => {
  for (const [a, b] of [
    ['child', 'sexual'],
    ['sexual', 'child'],
  ] as const) {
    expect(checkDeterministic(`${a} ${'word '.repeat(10)}${b}`).action).toBe(
      'hard_block',
    );
    expect(checkDeterministic(`${a} ${'word '.repeat(11)}${b}`).action).toBe(
      'pass',
    );
  }
});
it.each([
  'in the voice of Taylor Swift',
  'sounding like Adele',
  'sing like Beyoncé',
  'in the style of Ed Sheeran',
  'Tarkan tarzında',
  'Tarkan gibi söyle',
  "Tarkan'ın sesiyle",
  'Tarkan sesiyle',
  "Sezen Aksu'nun sesiyle",
])('UT-36 artist %s', (text) => {
  expect(checkDeterministic(text).action).toBe('block');
});
it('hard_block wins, hits are unique, and results contain no input evidence', () => {
  const result = checkDeterministic(
    'forbiddensentinel forbiddensentinel in the voice of Adele',
    { lists },
  );
  expect(result).toEqual({
    action: 'hard_block',
    hits: [
      { rule: 'hard_block_term', category: 'minor_sexual' },
      { rule: 'artist_voice', category: 'artist_impersonation' },
    ],
  });
  for (const word of ['forbiddensentinel', 'Adele', 'in the voice of'])
    expect(JSON.stringify(result)).not.toContain(word);
});
it('loads sorted unique hash data and 30 artist names', () => {
  for (const entries of [hardBlockEn, hardBlockTr]) {
    expect(entries.length).toBeGreaterThan(0);
    expect(entries).toEqual([...new Set(entries)].sort());
    entries.forEach((entry) => {
      expect(entry).toMatch(/^[a-f0-9]{64}$/);
    });
  }
  expect(artists).toHaveLength(30);
});
it.each([
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  [
    'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  ],
  [
    'a'.repeat(1_000_000),
    'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
  ],
])('SHA-256 NIST vector %#', (text, digest) => {
  expect(sha256(text)).toBe(digest);
});
