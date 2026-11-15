import { describe, expect, it } from 'vitest';
import {
  addMissingTags,
  lyricWords,
  normaliseTag,
  parseLyrics,
  serialiseLyrics,
  toSections,
  validateSections,
} from './lyrics.js';

const tagged = `[Verse]
Morning light on the harbour
We walk the long way home

[Chorus]
Sing it loud
Sing it slow
`;

describe('UT-41 parseLyrics', () => {
  it('reads tagged sections and ignores blank lines inside them', () => {
    const blocks = parseLyrics(tagged);
    expect(toSections(blocks)).toEqual([
      {
        tag: '[Verse]',
        lines: ['Morning light on the harbour', 'We walk the long way home'],
      },
      { tag: '[Chorus]', lines: ['Sing it loud', 'Sing it slow'] },
    ]);
  });
  it('keeps text before the first tag as an untagged block', () => {
    const blocks = parseLyrics('first line\n[Chorus]\nla la');
    expect(blocks[0]).toEqual({ tag: null, lines: ['first line'] });
    expect(toSections(blocks)).toBeNull();
  });
  it('handles CRLF and an empty text', () => {
    expect(toSections(parseLyrics('[Outro]\r\nbye\r\n'))).toEqual([
      { tag: '[Outro]', lines: ['bye'] },
    ]);
    expect(parseLyrics('')).toEqual([]);
    expect(toSections([])).toBeNull();
  });
});

describe('UT-42 serialiseLyrics', () => {
  it('round-trips with parseLyrics', () => {
    const sections = toSections(parseLyrics(tagged));
    expect(sections).not.toBeNull();
    const text = serialiseLyrics(sections ?? []);
    expect(toSections(parseLyrics(text))).toEqual(sections);
    expect(serialiseLyrics(toSections(parseLyrics(text)) ?? [])).toBe(text);
  });
  it('serialises nothing to an empty string', () => {
    expect(serialiseLyrics([])).toBe('');
  });
});

describe('UT-43 numbered, spaced and unknown tags', () => {
  it.each([
    ['[Verse 2]', '[Verse]'],
    ['[ pre chorus ]', '[Pre-Chorus]'],
    ['[PRE-CHORUS]', '[Pre-Chorus]'],
    ['[Intro]', '[Intro]'],
    ['[bridge]', '[Bridge]'],
    ['[Chorus 10]', '[Chorus]'],
  ])('%s → %s', (line, tag) => {
    expect(normaliseTag(line)).toBe(tag);
  });
  it.each(['[Hook]', '[laughs]', 'Verse', '[Verse', 'the [Chorus] line'])(
    '%s is lyrics, not a tag',
    (line) => {
      expect(normaliseTag(line)).toBeNull();
    },
  );
  it('reports unknown tags and empty sections', () => {
    expect(
      validateSections([
        { tag: '[Hook]', lines: ['a'] },
        { tag: '[Verse]', lines: [' '] },
        { tag: '[Chorus]', lines: ['b'] },
      ]),
    ).toEqual([
      { index: 0, problem: 'unknown_tag', tag: '[Hook]' },
      { index: 1, problem: 'empty' },
    ]);
  });
});

const untagged = `Morning light on the harbour
We walk the long way home

Sing it loud
Sing it slow

Evening falls on the water
[laughs] we are almost there

Sing it loud
Sing it slow`;

describe('UT-44 addMissingTags proposal', () => {
  it('tags stanzas: repeated ones become [Chorus], others [Verse]', () => {
    const proposal = addMissingTags(untagged);
    expect(proposal.sections.map((s) => s.tag)).toEqual([
      '[Verse]',
      '[Chorus]',
      '[Verse]',
      '[Chorus]',
    ]);
    expect(proposal.changes).toHaveLength(4);
  });
  it('keeps existing tags and proposes nothing for complete lyrics', () => {
    expect(addMissingTags(tagged).changes).toEqual([]);
    const mixed = addMissingTags('intro words\n\n[Chorus]\nla la');
    expect(mixed.sections.map((s) => s.tag)).toEqual(['[Verse]', '[Chorus]']);
    expect(mixed.changes).toEqual([{ index: 0, tag: '[Verse]' }]);
  });
});

describe('UT-45 addMissingTags never changes words', () => {
  it.each([
    untagged,
    tagged,
    'one line only',
    '  spaced   words  \n\n\n[Hook]\nweird [tag] inside\n',
    'Bir şarkı\nİstanbul’da akşam\n\nBir şarkı\nİstanbul’da akşam',
  ])('words are identical and in order', (text) => {
    const proposal = addMissingTags(text);
    expect(lyricWords(serialiseLyrics(proposal.sections))).toEqual(
      lyricWords(text),
    );
  });
});
