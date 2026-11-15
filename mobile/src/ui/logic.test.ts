import { expect, it } from 'vitest';
import {
  codeDigits,
  nextDatePart,
  missingConsents,
  cooldownTime,
} from './logic';
import { parseAppearance, resolveAppearance } from '@songsmith/ui-tokens';
it('accepts digit entry and a pasted code, discarding extra/non-digit characters', () => {
  expect(codeDigits('1')).toBe('1');
  expect(codeDigits('12 34-56')).toBe('123456');
  expect(codeDigits('a1234567')).toBe('123456');
  expect(codeDigits('')).toBe('');
});
it('advances only completed date parts in locale order', () => {
  expect(nextDatePart('tr', 'day', '01')).toBe('month');
  expect(nextDatePart('en', 'month', '12')).toBe('day');
  expect(nextDatePart('tr', 'month', '12')).toBe('year');
  expect(nextDatePart('en', 'day', '03')).toBe('year');
  expect(nextDatePart('en', 'month', '1')).toBeUndefined();
  expect(nextDatePart('tr', 'year', '1990')).toBeUndefined();
});
it('resolves persisted appearance and live system changes', () => {
  expect(parseAppearance('invalid')).toBe('system');
  expect(resolveAppearance('system', 'dark')).toBe('dark');
  expect(resolveAppearance('system', 'light')).toBe('light');
  expect(resolveAppearance('light', 'dark')).toBe('light');
  expect(resolveAppearance('dark', null)).toBe('dark');
});
it('identifies each missing required consent without requiring optional choices', () => {
  expect(missingConsents({})).toEqual(['terms', 'privacy', 'ai_disclosure']);
  expect(
    missingConsents({ terms: true, privacy: false, ai_disclosure: true }),
  ).toEqual(['privacy']);
  expect(
    missingConsents({
      terms: true,
      privacy: true,
      ai_disclosure: true,
      marketing: false,
    }),
  ).toEqual([]);
});
it('formats resend time as minutes and padded seconds', () => {
  expect(cooldownTime(60)).toBe('1:00');
  expect(cooldownTime(42)).toBe('0:42');
  expect(cooldownTime(0)).toBe('0:00');
});
