import { expect, test } from 'vitest';
import * as domain from './index';

test('the domain entry point exports the pure router', () => {
  expect(Object.keys(domain)).toEqual(['route']);
});
