import { formatMessage, type MessageKey } from '@songsmith/i18n';
import { expect, test } from 'vitest';
import {
  errorCatalogue,
  errorCodeSchema,
  errorResponseSchema,
} from './errors.js';

test('UT-02 all codes have HTTP statuses and TR/EN messages', () => {
  expect(Object.keys(errorCatalogue).sort()).toEqual(
    [...errorCodeSchema.options].sort(),
  );
  expect(Object.keys(errorCatalogue)).toHaveLength(16);
  for (const { status, messageKey } of Object.values(errorCatalogue)) {
    const key: MessageKey = messageKey;
    expect(Number.isInteger(status) && status >= 400 && status <= 599).toBe(
      true,
    );
    for (const locale of ['tr', 'en'] as const)
      expect(formatMessage(locale, key).trim()).not.toBe('');
  }
});
test('error response schema validates codes, messages and JSON details', () => {
  const error = { code: 'VALIDATION', message: 'test' };
  expect(errorResponseSchema.safeParse({ error }).success).toBe(true);
  expect(
    errorResponseSchema.safeParse({
      error: {
        ...error,
        details: { fields: ['title'], nested: { valid: false } },
      },
    }).success,
  ).toBe(true);
  for (const invalid of [
    {},
    { error: { ...error, code: 'UNKNOWN' } },
    { error: { ...error, message: '' } },
    { error: { ...error, stack: 'private' } },
    { error: { ...error, details: { value: undefined } } },
  ])
    expect(errorResponseSchema.safeParse(invalid).success).toBe(false);
});
