import { describe, expect, it } from 'vitest';
import {
  catalogueModelSchema,
  operationSchema,
  type CatalogueModel,
  type Operation,
} from '@songsmith/schemas';
import { route } from './router.js';

function model(
  id = 'a',
  overrides: Partial<CatalogueModel> = {},
): CatalogueModel {
  return catalogueModelSchema.parse({
    id,
    displayName: id,
    qualityRank: 20,
    available: true,
    prices: Object.fromEntries(
      operationSchema.options.map((operation) => [operation, 10]),
    ),
    languages: { en: 'verified', tr: 'verified' },
    capabilities: {
      operations: [...operationSchema.options],
      minDurationSec: 1,
      maxDurationSec: 180,
      outputFormats: ['mp3'],
      controls: { bpm: false, lengthControl: false, vocalType: false },
      returnsTimestamps: 'none',
      returnsLyrics: false,
      acceptsExternalAudio: true,
      stemSets: [],
      watermark: ['none'],
    },
    ...overrides,
  });
}
const base = {
  operation: 'generate' as const,
  language: 'en',
  instrumental: false,
  allowBetaLanguages: false,
};
const run = (
  models: CatalogueModel[],
  overrides: Partial<Parameters<typeof route>[0]> = {},
) => route({ ...base, models, ...overrides });
const without = (operation: Operation) =>
  model('a', {
    capabilities: {
      ...model().capabilities,
      operations: operationSchema.options.filter((op) => op !== operation),
    },
  });

describe('UT-20 capability filter', () => {
  it.each(operationSchema.options)('requires the %s operation', (operation) => {
    expect(run([without(operation)], { operation })).toMatchObject({
      ok: false,
      perModel: { a: `cannot_${operation}` },
    });
  });
  it.each([
    {
      operation: 'generate' as const,
      instrumental: false,
      missing: 'custom_lyrics' as const,
    },
    {
      operation: 'image_input' as const,
      instrumental: false,
      missing: 'custom_lyrics' as const,
    },
    {
      operation: 'generate' as const,
      instrumental: true,
      missing: 'instrumental' as const,
    },
  ])(
    'requires $missing for $operation instrumental=$instrumental',
    ({ missing, ...input }) => {
      expect(run([without(missing)], input)).toMatchObject({
        ok: false,
        perModel: { a: `cannot_${missing}` },
      });
    },
  );
  it.each(['generate', 'image_input', 'extend', 'stems'] as const)(
    'does not require unrelated capabilities for %s',
    (operation) => {
      expect(
        run([without('custom_lyrics')], {
          operation,
          instrumental: operation === 'generate' || operation === 'image_input',
        }),
      ).toMatchObject({ ok: true });
    },
  );
});
describe('UT-21 verified language only', () => {
  it.each([
    { language: 'en', languages: { en: 'verified' as const }, ok: true },
    { language: 'tr', languages: { tr: 'unverified' as const }, ok: false },
    { language: 'tr', languages: {}, ok: false },
    { language: null, languages: { en: 'verified' as const }, ok: false },
  ])('$language with $languages', ({ language, languages, ok }) => {
    expect(run([model('a', { languages })], { language })).toMatchObject(
      ok ? { ok: true } : { ok: false, perModel: { a: 'language_unverified' } },
    );
  });
});
describe('UT-22 beta language opt-in', () => {
  it.each([true, false])('allowBetaLanguages=%s', (allowBetaLanguages) => {
    expect(
      run([model('a', { languages: { en: 'beta' } })], { allowBetaLanguages })
        .ok,
    ).toBe(allowBetaLanguages);
  });
});
describe('UT-23 instrumental skips language', () => {
  it.each([null, 'tr', 'missing'])('language=%s', (language) => {
    expect(
      run([model('a', { languages: {} })], { language, instrumental: true }),
    ).toMatchObject({ ok: true });
  });
});
describe('UT-24 eligible source preferred', () => {
  it.each(['extend', 'stems'] as const)(
    '%s keeps even a lower-ranked source without external audio',
    (operation) => {
      const models = [
        model('a'),
        model('source', {
          qualityRank: 1,
          capabilities: {
            ...model().capabilities,
            acceptsExternalAudio: false,
          },
        }),
      ];
      expect(run(models, { operation, sourceModelId: 'source' })).toEqual({
        ok: true,
        modelId: 'source',
        reason: { kind: 'source' },
      });
      expect(
        run(models, {
          operation,
          sourceModelId: 'source',
          requestedModelId: 'a',
        }),
      ).toMatchObject({ ok: false, perModel: { a: 'not_source_model' } });
    },
  );
});
describe('UT-25 ineligible source requires external audio', () => {
  it.each(['extend', 'stems'] as const)(
    '%s warns about a different model',
    (operation) => {
      const models = [
        model('source', { available: false }),
        model('external', { qualityRank: 1 }),
        model('internal', {
          capabilities: {
            ...model().capabilities,
            acceptsExternalAudio: false,
          },
        }),
      ];
      expect(run(models, { operation, sourceModelId: 'source' })).toEqual({
        ok: true,
        modelId: 'external',
        reason: { kind: 'auto', differentModel: true },
      });
      expect(
        run(models, {
          operation,
          sourceModelId: 'source',
          requestedModelId: 'internal',
        }),
      ).toMatchObject({
        ok: false,
        perModel: { source: 'unavailable', internal: 'no_external_audio' },
      });
      expect(
        run(models, {
          operation,
          sourceModelId: 'unknown',
          requestedModelId: 'external',
        }),
      ).toEqual({
        ok: true,
        modelId: 'external',
        reason: { kind: 'manual', differentModel: true },
      });
    },
  );
});
describe('UT-26 manual choice', () => {
  it.each([
    {
      requestedModelId: 'b',
      expected: { ok: true, modelId: 'b', reason: { kind: 'manual' } },
    },
    {
      requestedModelId: 'off',
      expected: {
        ok: false,
        error: 'MODEL_NOT_ELIGIBLE',
        perModel: { off: 'unavailable' },
      },
    },
    {
      requestedModelId: 'missing',
      expected: {
        ok: false,
        error: 'MODEL_NOT_ELIGIBLE',
        perModel: { missing: 'unknown_model' },
      },
    },
  ])('$requestedModelId', ({ requestedModelId, expected }) => {
    expect(
      run(
        [
          model('a'),
          model('b', { qualityRank: 1 }),
          model('off', { available: false }),
        ],
        { requestedModelId },
      ),
    ).toMatchObject(expected);
  });
});
describe('UT-27 deterministic tie-break', () => {
  it.each([
    {
      models: [
        model('b', { qualityRank: 21, prices: { generate: 99 } }),
        model('a'),
      ],
      id: 'b',
    },
    { models: [model('b', { prices: { generate: 0 } }), model('a')], id: 'b' },
    { models: [model('b'), model('a')], id: 'a' },
  ])('chooses $id by rank, price, then id', ({ models, id }) => {
    const snapshot = models.map((entry) => model(entry.id, entry));
    expect(run(models)).toMatchObject({
      ok: true,
      modelId: id,
      reason: { kind: 'auto' },
    });
    expect(models).toEqual(snapshot);
    expect(run([...models].reverse())).toMatchObject({ modelId: id });
  });
});
describe('UT-28 every excluded model has its first reason', () => {
  it.each([false, true])(
    'first failure wins with source filter=%s',
    (source) => {
      const models = [
        model('capability', {
          capabilities: { ...model().capabilities, operations: ['stems'] },
          prices: {},
          languages: {},
          available: false,
        }),
        model('price', { prices: {}, languages: {}, available: false }),
        model('language', { languages: {}, available: false }),
        model('health', { available: false }),
      ];
      expect(
        run(
          models,
          source ? { operation: 'extend', sourceModelId: 'missing' } : {},
        ),
      ).toEqual({
        ok: false,
        error: 'NO_ELIGIBLE_MODEL',
        perModel: {
          capability: source ? 'cannot_extend' : 'cannot_generate',
          price: 'no_price',
          language: 'language_unverified',
          health: 'unavailable',
        },
      });
    },
  );
  it.each([
    { models: [] },
    {
      models: [
        model('internal', {
          capabilities: {
            ...model().capabilities,
            acceptsExternalAudio: false,
          },
        }),
      ],
    },
  ])('handles no remaining source candidates', ({ models }) => {
    expect(
      run(models, { operation: 'extend', sourceModelId: 'missing' }),
    ).toEqual({
      ok: false,
      error: 'NO_ELIGIBLE_MODEL',
      perModel: models.length ? { internal: 'no_external_audio' } : {},
    });
  });
});
describe('UT-29 availability from breakers and kill switches', () => {
  it.each(['breaker open', 'kill switch'])('%s excludes a model', () => {
    expect(run([model('a', { available: false })])).toEqual({
      ok: false,
      error: 'NO_ELIGIBLE_MODEL',
      perModel: { a: 'unavailable' },
    });
  });
});
describe('seeded mock catalogue shape', () => {
  const a = model('mock-music-a', {
    languages: { en: 'verified', tr: 'unverified' },
    capabilities: {
      ...model().capabilities,
      operations: ['generate', 'instrumental', 'custom_lyrics', 'image_input'],
      outputFormats: ['mp3', 'wav'],
      acceptsExternalAudio: false,
      watermark: ['synthid'],
    },
    prices: {
      generate: 10,
      instrumental: 10,
      custom_lyrics: 10,
      image_input: 10,
    },
  });
  const b = model('mock-music-b', {
    qualityRank: 10,
    capabilities: {
      ...model().capabilities,
      operations: [
        'generate',
        'instrumental',
        'custom_lyrics',
        'extend',
        'stems',
      ],
      maxDurationSec: 300,
      stemSets: ['two_stems', 'six_stems'],
    },
    prices: {
      generate: 10,
      instrumental: 10,
      custom_lyrics: 10,
      extend: 10,
      stems: 20,
    },
  });
  it.each([
    { operation: 'generate' as const, language: 'en', modelId: a.id },
    { operation: 'generate' as const, language: 'tr', modelId: b.id },
    { operation: 'extend' as const, language: 'tr', modelId: b.id },
  ])('$operation in $language selects $modelId', ({ modelId, ...input }) => {
    expect(run([a, b], input)).toMatchObject({ ok: true, modelId });
  });
});
