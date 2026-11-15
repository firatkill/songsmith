import { expect, it } from 'vitest';
import {
  appearanceFromCookie,
  appearanceCookie,
  appearanceAttribute,
  resolveAppearance,
} from './appearance';
it('accepts only supported cookie preferences', () => {
  expect(appearanceFromCookie('dark')).toBe('dark');
  expect(appearanceFromCookie('light')).toBe('light');
  for (const value of [undefined, '', 'system', 'dark; injected=true'])
    expect(appearanceFromCookie(value)).toBe('system');
});
it('renders an explicit server theme only for manual preferences', () => {
  expect(appearanceAttribute('light')).toBe('light');
  expect(appearanceAttribute('dark')).toBe('dark');
  expect(appearanceAttribute('system')).toBeUndefined();
});
it('persists site-wide preference with secure cookies on HTTPS', () => {
  expect(appearanceCookie('dark', true)).toBe(
    'songsmith-appearance=dark; Path=/; Max-Age=31536000; SameSite=Lax; Secure',
  );
  expect(appearanceCookie('system', false)).not.toContain('Secure');
});
it('system tracks OS changes while explicit preferences override it', () => {
  expect(resolveAppearance('system', 'dark')).toBe('dark');
  expect(resolveAppearance('system', 'light')).toBe('light');
  expect(resolveAppearance('dark', 'light')).toBe('dark');
  expect(resolveAppearance('light', 'dark')).toBe('light');
});
