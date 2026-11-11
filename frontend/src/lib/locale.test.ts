import { expect, test } from 'vitest';
import { preferredLocale, localizedPath, onboardingPath } from './locale';
test.each([
  [undefined, 'tr-TR,en;q=0.8', 'tr'],
  ['en', 'tr', 'en'],
  ['invalid', 'tr;q=0,en;q=0.8', 'en'],
  [undefined, 'de', 'en'],
  [undefined, undefined, 'en'],
])(
  'locale cookie %s and header %s resolve to %s',
  (cookie, header, expected) => {
    expect(preferredLocale(cookie, header)).toBe(expected);
  },
);
test('switching preserves the route; root has no extra slash', () => {
  expect(localizedPath('/en/library', 'tr')).toBe('/tr/library');
  expect(localizedPath('/', 'en')).toBe('/en');
});
test('redirect order is session, age, consents, home', () => {
  expect(onboardingPath('tr', null)).toBe('/tr/sign-in');
  expect(
    onboardingPath('en', { needsAgeGate: true, missingConsents: ['terms'] }),
  ).toBe('/en/age-gate');
  expect(
    onboardingPath('en', { needsAgeGate: false, missingConsents: ['terms'] }),
  ).toBe('/en/consent');
  expect(
    onboardingPath('en', { needsAgeGate: false, missingConsents: [] }),
  ).toBe('/en/home');
});
