import { expect, test } from 'vitest';
import { formatMessage } from '@songsmith/i18n';
import { catalogueSchema, routerReasonCodeSchema } from './catalogue.js';
import { operationSchema } from './providers.js';

test('every router reason has TR and EN copy, including all operations', () => {
  for (const operation of operationSchema.options)
    expect(routerReasonCodeSchema.options).toContain(`cannot_${operation}`);
  for (const reason of routerReasonCodeSchema.options)
    for (const locale of ['tr', 'en'] as const)
      expect(formatMessage(locale, `router.reason.${reason}`).trim()).not.toBe(
        '',
      );
});

test('catalogue permits missing operation prices but rejects fractional credits and unknown language statuses', () => {
  const model = {
    id: 'music',
    displayName: 'Music',
    qualityRank: 1,
    available: true,
    capabilities: {
      operations: ['generate'],
      minDurationSec: 1,
      maxDurationSec: 180,
      outputFormats: ['mp3'],
      controls: { bpm: false, lengthControl: false, vocalType: false },
      returnsTimestamps: 'none',
      returnsLyrics: false,
      acceptsExternalAudio: false,
      stemSets: [],
      watermark: ['none'],
    },
    prices: {},
    languages: { 'en-US': 'verified' },
  };
  expect(catalogueSchema.safeParse({ models: [model] }).success).toBe(true);
  for (const override of [
    { prices: { generate: 1.5 } },
    { prices: { generate: -1 } },
    { languages: { tr: 'supported' } },
    { available: 'yes' },
  ])
    expect(
      catalogueSchema.safeParse({ models: [{ ...model, ...override }] })
        .success,
    ).toBe(false);
});
