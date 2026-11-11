import { expect, test } from 'vitest';
import { errorCatalogue } from './validation';
import { formatMessage } from '@songsmith/i18n';
import { apiErrorCode, apiErrorMessage } from './errors';
test.each(Object.entries(errorCatalogue))(
  'maps %s by catalogue, never by untrusted message',
  (code, entry) => {
    for (const locale of ['en', 'tr'] as const)
      expect(
        apiErrorMessage(locale, { error: { code, message: 'untrusted' } }),
      ).toBe(formatMessage(locale, entry.messageKey));
  },
);
test('malformed and unknown errors fail safely', () => {
  for (const error of [
    null,
    new Error('private'),
    { error: { code: 'NEW_CODE', message: 'private' } },
  ]) {
    expect(apiErrorCode(error)).toBe('INTERNAL');
    expect(apiErrorMessage('tr', error)).not.toContain('private');
  }
});
