import { describe, expect, test } from 'vitest';
import {
  catalogueModelSchema,
  curatedGenres,
  songCreateRequestSchema,
  type CatalogueModel,
} from '@songsmith/schemas';
import { moderationParts, songRequest, styleControls } from './request';
import { initialState, reducer, type Action } from './state';

const curated = new Set<string>(curatedGenres);
const model = (controls: {
  bpm: boolean;
  vocalType: boolean;
}): CatalogueModel =>
  catalogueModelSchema.parse({
    id: 'm',
    displayName: 'M',
    qualityRank: 1,
    available: true,
    prices: { generate: 10 },
    languages: { en: 'verified' },
    capabilities: {
      operations: ['generate', 'custom_lyrics', 'instrumental'],
      minDurationSec: 1,
      maxDurationSec: 180,
      outputFormats: ['mp3'],
      controls: { ...controls, lengthControl: false },
      returnsTimestamps: 'none',
      returnsLyrics: false,
      acceptsExternalAudio: false,
      stemSets: [],
      watermark: ['none'],
    },
  });
const plain = model({ bpm: false, vocalType: false });
const rich = model({ bpm: true, vocalType: true });
const draft = (actions: Action[]) =>
  actions.reduce(reducer, initialState('en')).draft;
const lyrics: Action = {
  type: 'lyrics',
  title: 'Sea',
  sections: [{ tag: '[Verse]', lines: ['The sea is calm'] }],
};

describe('request builders', () => {
  test('Describe sends the description and the lyrics', () => {
    const d = draft([
      { type: 'field', field: 'description', value: ' a calm song ' },
      lyrics,
      { type: 'style', patch: { durationSec: 400, free: 'soft strings' } },
    ]);
    const body = songRequest(d, plain, false);
    expect(songCreateRequestSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      title: 'Sea',
      language: 'en',
      instrumental: false,
      durationSec: 180,
      description: 'a calm song',
      sections: [{ tag: '[Verse]', lines: ['The sea is calm'] }],
      style: 'soft strings',
    });
    expect(moderationParts(d, curated).map((p) => p.surface)).toEqual([
      'title',
      'description',
      'lyrics',
      'style',
    ]);
  });
  test('My lyrics sends no description', () => {
    const d = draft([
      { type: 'field', field: 'description', value: 'old idea' },
      { type: 'mode', mode: 'lyrics' },
      lyrics,
    ]);
    expect(songRequest(d, plain, true)).not.toHaveProperty('description');
    expect(songRequest(d, plain, true).modelId).toBe('m');
    expect(moderationParts(d, curated).map((p) => p.surface)).toEqual([
      'title',
      'lyrics',
    ]);
  });
  test('instrumental sends no sections and no vocal type', () => {
    const d = draft([
      { type: 'field', field: 'description', value: 'piano' },
      { type: 'field', field: 'title', value: 'Keys' },
      { type: 'instrumental', value: true },
      { type: 'style', patch: { vocalType: 'female' } },
    ]);
    const body = songRequest(d, rich, false);
    expect(body).not.toHaveProperty('sections');
    expect(body.styleControls).toBeUndefined();
    expect(songCreateRequestSchema.safeParse(body).success).toBe(true);
  });
  test('controls follow the model; free genre text is moderated', () => {
    const d = draft([
      lyrics,
      {
        type: 'style',
        patch: {
          genre: 'other',
          genreText: 'sea shanty',
          mood: 'epic',
          tempo: 'fast',
          bpm: '128',
          vocalType: 'choir',
        },
      },
    ]);
    expect(styleControls(d, plain)).toEqual({
      genre: 'sea shanty',
      mood: 'epic',
      tempo: 'fast',
    });
    expect(styleControls(d, rich)).toEqual({
      genre: 'sea shanty',
      mood: 'epic',
      tempo: 'fast',
      bpm: 128,
      vocalType: 'choir',
    });
    expect(moderationParts(d, curated).at(-1)).toEqual({
      surface: 'style',
      text: 'sea shanty',
    });
    const curatedOnly = draft([
      lyrics,
      { type: 'style', patch: { genre: 'pop' } },
    ]);
    expect(moderationParts(curatedOnly, curated).map((p) => p.surface)).toEqual(
      ['title', 'lyrics'],
    );
  });
});
