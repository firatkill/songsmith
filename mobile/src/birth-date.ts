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
