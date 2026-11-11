import { IntlMessageFormat } from 'intl-messageformat';
import { expect, test } from 'vitest';
import {
  capitalize,
  foldForSearch,
  formatMessage,
  messages,
  resolveLocale,
  toLower,
  toUpper,
} from './index.js';

test('UT-01 Turkish display casing and forgiving search', () => {
  expect(toUpper('istanbul', 'tr')).toBe('İSTANBUL');
  expect(toLower('IŞIK', 'tr')).toBe('ışık');
  expect(toUpper('ılık', 'tr')).toBe('ILIK');
  expect(toLower('İSTANBUL', 'tr')).toBe('istanbul');
  expect(toUpper('istanbul', 'en')).toBe('ISTANBUL');
  expect(toLower('ISTANBUL', 'en')).toBe('istanbul');
  for (const value of ['İstanbul', 'ISTANBUL', 'istanbul', 'I\u0307stanbul'])
    expect(foldForSearch(value, 'tr')).toBe('istanbul');
  expect(capitalize('istanbul', 'tr')).toBe('İstanbul');
  expect(capitalize('IŞIK', 'tr')).toBe('Işık');
  expect(capitalize('HELLO', 'en')).toBe('Hello');
  expect(capitalize('', 'tr')).toBe('');
});
test('UT-02 translation keys match and every message is valid ICU', () => {
  expect(Object.keys(messages.tr).sort()).toEqual(
    Object.keys(messages.en).sort(),
  );
  for (const locale of ['tr', 'en'] as const)
    for (const message of Object.values(messages[locale])) {
      expect(message.trim()).not.toBe('');
      expect(() => new IntlMessageFormat(message, locale)).not.toThrow();
    }
});
test('ICU plural and number formatting in both locales', () => {
  expect(formatMessage('en', 'common.items', { count: 1 })).toBe('1 item');
  expect(formatMessage('en', 'common.items', { count: 2 })).toBe('2 items');
  expect(formatMessage('tr', 'common.items', { count: 1 })).toBe('1 öğe');
  expect(formatMessage('tr', 'common.items', { count: 2 })).toBe('2 öğe');
  expect(formatMessage('en', 'common.number', { value: 1234.5 })).toBe(
    '1,234.5',
  );
  expect(formatMessage('tr', 'common.number', { value: 1234.5 })).toBe(
    '1.234,5',
  );
  expect(formatMessage('tr', 'common.save')).toBe('Kaydet');
  expect(() => {
    // @ts-expect-error -- Unknown message keys must fail compile-time validation.
    formatMessage('en', 'missing.key');
  }).toThrow();
});
test.each([
  ['tr-TR,en;q=0.8', 'tr'],
  ['en;q=0.3,tr;q=0.9', 'tr'],
  ['TR-tr', 'tr'],
  ['tr;q=0,en', 'en'],
  ['fr,de', 'en'],
  ['tr;q=oops', 'en'],
  ['tr;q=2', 'en'],
  ['en,tr', 'en'],
  ['*', 'en'],
  ['', 'en'],
] as const)('resolveLocale(%s) = %s', (input, expected) => {
  expect(resolveLocale(input)).toBe(expected);
});
test('device locale lists and missing preference', () => {
  expect(resolveLocale(['fr-FR', 'tr-TR', 'en-US'])).toBe('tr');
  expect(resolveLocale(undefined)).toBe('en');
});

test('user-facing messages never expose internal tasks or editorial placeholders', () => {
  for (const locale of ['en', 'tr'] as const) {
    for (const [key, message] of Object.entries(messages[locale])) {
      expect(message, `${locale}:${key}`).not.toMatch(/\bT-\d{2}\b/);
      expect(message, `${locale}:${key}`).not.toMatch(/\b(TODO|TBD|FIXME)\b/);
    }
  }
});
