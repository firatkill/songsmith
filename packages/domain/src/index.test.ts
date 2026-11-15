import { expect, test } from 'vitest';
import * as domain from './index.js';

test('the domain entry point exports the router, the lyrics and the create helpers', () => {
  expect(Object.keys(domain).sort()).toEqual(
    [
      'route',
      'normaliseTag',
      'parseLyrics',
      'toSections',
      'serialiseLyrics',
      'validateSections',
      'addMissingTags',
      'lyricWords',
      'modelChoice',
      'durationRange',
      'clampDuration',
      'styleText',
    ].sort(),
  );
});
