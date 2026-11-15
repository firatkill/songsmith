import { expect, test } from 'vitest';
import * as domain from './index.js';

test('the domain entry point exports the router and the lyrics helpers', () => {
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
    ].sort(),
  );
});
