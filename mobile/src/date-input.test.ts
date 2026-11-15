import { expect, it } from 'vitest';
import { applyDateInput, parseBirthDate, birthDateOrder } from './birth-date';
const empty = { day: '', month: '', year: '' };
const complete = { day: '15', month: '06', year: '1990' };
it.each(['en', 'tr'] as const)(
  'carries rapid input bursts and focuses the next incomplete field (%s)',
  (locale) => {
    const first = locale === 'en' ? 'month' : 'day';
    const prefix = locale === 'en' ? '0615' : '1506';
    expect(applyDateInput(locale, first, prefix, empty)).toEqual({
      parts: { ...complete, year: '' },
      focus: 'year',
    });
    expect(applyDateInput(locale, first, prefix + '1990', empty)).toEqual({
      parts: complete,
      focus: 'year',
    });
    expect(applyDateInput(locale, first, prefix + '199', empty)).toEqual({
      parts: { ...complete, year: '199' },
      focus: 'year',
    });
  },
);
it.each(['en', 'tr'] as const)(
  'preserves values when typing moves between fields (%s)',
  (locale) => {
    let parts = empty;
    for (const part of birthDateOrder(locale)) {
      for (let size = 1; size <= complete[part].length; size++) {
        parts = applyDateInput(
          locale,
          part,
          complete[part].slice(0, size),
          parts,
        ).parts;
      }
    }
    expect(parts).toEqual(complete);
  },
);
it.each(['en', 'tr'] as const)(
  'accepts ISO, separated and locale-compact date pastes into any field (%s)',
  (locale) => {
    for (const part of birthDateOrder(locale)) {
      for (const raw of [
        '1990-06-15',
        '15/06/1990',
        locale === 'en' ? '06/15/1990' : '15.06.1990',
        locale === 'en' ? '06151990' : '15061990',
      ]) {
        const result = applyDateInput(locale, part, raw, {
          day: '01',
          month: '02',
          year: '2000',
        });
        expect(result).toEqual({ parts: complete, focus: 'year' });
      }
    }
  },
);
it('uses locale order for ambiguous separated pastes', () => {
  expect(applyDateInput('en', 'year', '03/04/2000', empty).parts).toEqual({
    month: '03',
    day: '04',
    year: '2000',
  });
  expect(applyDateInput('tr', 'year', '03/04/2000', empty).parts).toEqual({
    month: '04',
    day: '03',
    year: '2000',
  });
});
it('carries overflow from the second field without overwriting the first', () => {
  expect(
    applyDateInput('en', 'day', '151990', { ...empty, month: '06' }).parts,
  ).toEqual(complete);
  expect(
    applyDateInput('tr', 'month', '061990', { ...empty, day: '15' }).parts,
  ).toEqual(complete);
});
it('supports corrections/deletion and leaves calendar validation to submission', () => {
  expect(applyDateInput('en', 'day', '', complete)).toEqual({
    parts: { ...complete, day: '' },
    focus: 'day',
  });
  expect(applyDateInput('en', 'day', '2', complete).parts).toEqual({
    ...complete,
    day: '2',
  });
  expect(
    parseBirthDate(applyDateInput('en', 'month', '02312000', empty).parts),
  ).toBeNull();
});
