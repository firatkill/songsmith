import type { Locale } from '@songsmith/i18n';
import { birthDateOrder, type BirthDatePart } from '../birth-date';
export function codeDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 6);
}
export function nextDatePart(
  locale: Locale,
  part: BirthDatePart,
  value: string,
) {
  const order = birthDateOrder(locale);
  return value.length === (part === 'year' ? 4 : 2)
    ? order[order.indexOf(part) + 1]
    : undefined;
}
export function missingConsents(selected: Record<string, boolean>) {
  return (['terms', 'privacy', 'ai_disclosure'] as const).filter(
    (kind) => !selected[kind],
  );
}
export function cooldownTime(seconds: number) {
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}
