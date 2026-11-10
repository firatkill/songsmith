import { expect, test } from 'vitest';
import * as domain from './index';

test('the domain placeholder loads without application exports', () => {
  expect(Object.keys(domain)).toEqual([]);
});
