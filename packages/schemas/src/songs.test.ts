import { describe, expect, test } from 'vitest';
import { songCreateRequestSchema } from './songs.js';

const sections = [{ tag: '[Verse]', lines: ['a line'] }];
describe('songCreateRequestSchema (T-20)', () => {
  test('My lyrics needs no description', () => {
    expect(
      songCreateRequestSchema.safeParse({
        title: 'T',
        language: 'en',
        sections,
      }).success,
    ).toBe(true);
  });
  test('instrumental needs a description', () => {
    const base = { title: 'T', language: 'en', instrumental: true };
    expect(songCreateRequestSchema.safeParse(base).success).toBe(false);
    expect(
      songCreateRequestSchema.safeParse({ ...base, description: 'calm piano' })
        .success,
    ).toBe(true);
  });
  test('instrumental refuses a vocal type', () => {
    const result = songCreateRequestSchema.safeParse({
      title: 'T',
      language: 'en',
      instrumental: true,
      description: 'calm piano',
      styleControls: { vocalType: 'female' },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([
      'styleControls',
      'vocalType',
    ]);
  });
  test('style controls are validated', () => {
    const ok = songCreateRequestSchema.safeParse({
      title: 'T',
      language: 'tr',
      sections,
      styleControls: { genre: 'pop', mood: 'happy', tempo: 'fast', bpm: 120 },
    });
    expect(ok.success).toBe(true);
    for (const styleControls of [
      { bpm: 20 },
      { mood: 'angry' },
      { tempo: 'medium-fast' },
      { genre: '' },
      { extra: 1 },
    ])
      expect(
        songCreateRequestSchema.safeParse({
          title: 'T',
          language: 'tr',
          sections,
          styleControls,
        }).success,
      ).toBe(false);
  });
});
