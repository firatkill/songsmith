import { expect, test } from 'vitest';
import { birthDateOrder, parseBirthDate } from './birth-date';
test('orders date fields by interface locale', () => {
  expect(birthDateOrder('tr')).toEqual(['day', 'month', 'year']);
  expect(birthDateOrder('en')).toEqual(['month', 'day', 'year']);
});
test('pads ISO dates and accepts a leap day and today', () => {
  expect(
    parseBirthDate({ day: '9', month: '2', year: '1990' }, '2026-11-11'),
  ).toBe('1990-02-09');
  expect(
    parseBirthDate({ day: '29', month: '2', year: '2000' }, '2026-11-11'),
  ).toBe('2000-02-29');
  expect(
    parseBirthDate({ day: '11', month: '11', year: '2026' }, '2026-11-11'),
  ).toBe('2026-11-11');
});
test.each([
  { day: '29', month: '2', year: '1900' },
  { day: '31', month: '4', year: '2000' },
  { day: '0', month: '1', year: '2000' },
  { day: '1', month: '13', year: '2000' },
  { day: '12', month: '11', year: '2026' },
  { day: '1', month: '1', year: '0000' },
  { day: '1', month: '1', year: '99' },
  { day: '1', month: '1', year: '' },
  { day: '1e1', month: '1', year: '1990' },
  { day: null, month: '1', year: '1990' },
])('rejects invalid or future calendar input %#', (parts) => {
  expect(parseBirthDate(parts, '2026-11-11')).toBeNull();
});
