import type { Locale } from '@songsmith/i18n';
import { ageRequestSchema } from './validation';
export type BirthDatePart = 'day' | 'month' | 'year';
export function birthDateOrder(locale: Locale): readonly BirthDatePart[] {
  return locale === 'tr' ? ['day', 'month', 'year'] : ['month', 'day', 'year'];
}
/** Transient form values only. Calendar validation is shared with the API. */
export function parseBirthDate(
  parts: Record<BirthDatePart, unknown>,
  today = new Date().toISOString().slice(0, 10),
): string | null {
  const { day, month, year } = parts;
  if (
    typeof day !== 'string' ||
    typeof month !== 'string' ||
    typeof year !== 'string'
  )
    return null;
  if (
    !/^\d{1,2}$/.test(day) ||
    !/^\d{1,2}$/.test(month) ||
    !/^\d{4}$/.test(year) ||
    year === '0000'
  )
    return null;
  const dateOfBirth = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return dateOfBirth <= today &&
    ageRequestSchema.safeParse({ dateOfBirth }).success
    ? dateOfBirth
    : null;
}

/** Distribute native/browser input bursts before moving focus; never truncate at the input boundary. */
export function applyDateInput(
  locale: Locale,
  part: BirthDatePart,
  raw: string,
  current: Record<BirthDatePart, string>,
): { parts: Record<BirthDatePart, string>; focus: BirthDatePart } {
  const order = birthDateOrder(locale);
  const parts = { ...current };
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw.trim());
  if (iso)
    return {
      parts: {
        year: iso[1] ?? '',
        month: (iso[2] ?? '').padStart(2, '0'),
        day: (iso[3] ?? '').padStart(2, '0'),
      },
      focus: 'year',
    };
  const separated = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/.exec(raw.trim());
  if (separated) {
    const first = separated[1] ?? '';
    const second = separated[2] ?? '';
    // Honor locale for ambiguous dates, but accept an unambiguous day-first/month-first paste.
    const dayFirst =
      Number(first) > 12 || (Number(second) <= 12 && locale === 'tr');
    return {
      parts: {
        day: (dayFirst ? first : second).padStart(2, '0'),
        month: (dayFirst ? second : first).padStart(2, '0'),
        year: separated[3] ?? '',
      },
      focus: 'year',
    };
  }
  let remaining = raw.replace(/\D/g, '');
  // Eight digits are a full date in locale order, pasted into any field.
  const start = remaining.length === 8 ? 0 : order.indexOf(part);
  let focus = part;
  for (let index = start; index < order.length; index++) {
    const key = order[index];
    if (!key) break;
    const size = key === 'year' ? 4 : 2;
    parts[key] = remaining.slice(0, size);
    focus = key;
    if (remaining.length < size) break;
    remaining = remaining.slice(size);
    const next = order[index + 1];
    if (!remaining) {
      focus = next ?? key;
      break;
    }
  }
  return { parts, focus };
}
