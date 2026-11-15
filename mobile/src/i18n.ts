import type { Locale } from '@songsmith/i18n';
export function selectLocale(
  saved: string | null,
  language: string | null,
): Locale {
  if (saved === 'tr' || saved === 'en') return saved;
  return language?.toLowerCase().split('-')[0] === 'tr' ? 'tr' : 'en';
}
