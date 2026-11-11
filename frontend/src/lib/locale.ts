import { resolveLocale, type Locale } from '@songsmith/i18n';
export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'tr';
}
export function preferredLocale(
  cookie: string | undefined,
  acceptLanguage: string | undefined,
): Locale {
  return isLocale(cookie) ? cookie : resolveLocale(acceptLanguage);
}
export function localizedPath(pathname: string, locale: Locale): string {
  const parts = pathname.split('/');
  if (isLocale(parts[1])) parts.splice(1, 1);
  return `/${locale}${parts.join('/') === '/' ? '' : parts.join('/')}`;
}
export function onboardingPath(
  locale: Locale,
  me: { needsAgeGate: boolean; missingConsents: readonly unknown[] } | null,
): string {
  return `/${locale}/${!me ? 'sign-in' : me.needsAgeGate ? 'age-gate' : me.missingConsents.length ? 'consent' : 'home'}`;
}
