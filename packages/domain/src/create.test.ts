import { describe, expect, it } from 'vitest';
import {
  catalogueModelSchema,
  operationSchema,
  type CatalogueModel,
} from '@songsmith/schemas';
import {
  clampDuration,
  durationRange,
  modelChoice,
  styleText,
} from './create.js';

function model(
  id: string,
  qualityRank: number,
  languages: CatalogueModel['languages'],
  maxDurationSec = 180,
): CatalogueModel {
  return catalogueModelSchema.parse({
    id,
    displayName: id.toUpperCase(),
    qualityRank,
    available: true,
    prices: { generate: 10 },
    languages,
    capabilities: {
      operations: [...operationSchema.options],
      minDurationSec: 1,
      maxDurationSec,
      outputFormats: ['mp3'],
      controls: { bpm: false, lengthControl: false, vocalType: false },
      returnsTimestamps: 'none',
      returnsLyrics: false,
      acceptsExternalAudio: false,
      stemSets: [],
      watermark: ['none'],
    },
  });
}
const a = model('mock-music-a', 20, { en: 'verified', tr: 'unverified' });
const b = model('mock-music-b', 10, { en: 'verified', tr: 'verified' }, 300);

describe('modelChoice', () => {
  it('Auto picks the best model and every model is eligible in English', () => {
    const choice = modelChoice({
      models: [a, b],
      language: 'en',
      instrumental: false,
    });
    expect(choice.autoModelId).toBe('mock-music-a');
    expect(choice.options.map((o) => o.eligible)).toEqual([true, true]);
    expect(choice.options[0]?.price).toBe(10);
  });
  it('a Turkish song disables A with the language reason (E2E-12)', () => {
    const choice = modelChoice({
      models: [a, b],
      language: 'tr',
      instrumental: false,
    });
    expect(choice.autoModelId).toBe('mock-music-b');
    expect(choice.options[0]).toMatchObject({
      id: 'mock-music-a',
      eligible: false,
      reason: 'language_unverified',
    });
  });
  it('instrumental skips the language check', () => {
    const choice = modelChoice({
      models: [a, b],
      language: 'tr',
      instrumental: true,
    });
    expect(choice.autoModelId).toBe('mock-music-a');
    expect(choice.options.every((o) => o.eligible)).toBe(true);
  });
  it('no eligible model leaves Auto empty', () => {
    const choice = modelChoice({
      models: [a],
      language: 'tr',
      instrumental: false,
    });
    expect(choice.autoModelId).toBeUndefined();
  });
});
describe('duration', () => {
  it('intersects the model limits with 30..300', () => {
    expect(durationRange(a)).toEqual({ min: 30, max: 180 });
    expect(durationRange(b)).toEqual({ min: 30, max: 300 });
    expect(durationRange(undefined)).toEqual({ min: 30, max: 300 });
  });
  it('clamps', () => {
    expect(clampDuration(a, 240)).toBe(180);
    expect(clampDuration(a, 10)).toBe(30);
    expect(clampDuration(b, 240)).toBe(240);
  });
});
describe('styleText', () => {
  it('builds a deterministic English string', () => {
    expect(
      styleText(
        {
          genre: 'turkish_pop',
          mood: 'happy',
          tempo: 'fast',
          vocalType: 'female',
        },
        ' with saz ',
      ),
    ).toBe('Turkish pop, happy, fast tempo, female vocal, with saz');
    expect(styleText({ tempo: 'slow', bpm: 70 })).toBe('70 BPM');
    expect(styleText({ genre: 'dream pop', vocalType: 'choir' })).toBe(
      'dream pop, choir vocals',
    );
    expect(styleText(undefined)).toBe('');
  });
});
