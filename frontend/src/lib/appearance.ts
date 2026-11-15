import { parseAppearance, type Appearance } from '@songsmith/ui-tokens';
export { resolveAppearance } from '@songsmith/ui-tokens';
export const appearanceCookieName = 'songsmith-appearance';
export function appearanceFromCookie(value: unknown): Appearance {
  return parseAppearance(value);
}
export function appearanceAttribute(value: unknown) {
  const preference = appearanceFromCookie(value);
  return preference === 'system' ? undefined : preference;
}
export function appearanceCookie(value: Appearance, secure: boolean) {
  return `${appearanceCookieName}=${parseAppearance(value)}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}`;
}
