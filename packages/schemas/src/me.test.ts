import { expect, it } from 'vitest';
import {
  ageRequestSchema,
  consentRequestSchema,
  consentVersions,
  handleSchema,
  patchMeSchema,
  reservedHandles,
} from './me.js';
it.each(['abc', 'my_handle_123', 'a'.repeat(30)])(
  'accepts handle %s',
  (value) => {
    expect(handleSchema.safeParse(value).success).toBe(true);
  },
);
it.each([
  'ab',
  'a'.repeat(31),
  'Upper',
  'has-space ',
  'has-dash',
  'user_',
  'user_abcdef123456',
  'user_chosen',
  ...reservedHandles,
])('rejects handle %s', (value) => {
  expect(handleSchema.safeParse(value).success).toBe(false);
});
it.each(['display_name', 'bio', 'is_adult', 'status'])(
  'rejects unauthorized patch field %s',
  (field) => {
    expect(patchMeSchema.safeParse({ [field]: 'value' }).success).toBe(false);
  },
);
it('rejects empty patch', () => {
  expect(patchMeSchema.safeParse({}).success).toBe(false);
});
it.each(Object.entries(consentVersions))(
  'validates current consent version for %s',
  (kind, version) => {
    expect(
      consentRequestSchema.safeParse({
        kind,
        version,
        granted: true,
        source: 'web',
      }).success,
    ).toBe(true);
    expect(
      consentRequestSchema.safeParse({
        kind,
        version: 'old',
        granted: true,
        source: 'ios',
      }).success,
    ).toBe(false);
  },
);
it.each(['2025-02-29', '2008-13-01', 'yesterday', '2000-01-01T00:00:00Z'])(
  'rejects malformed DOB %s',
  (dateOfBirth) => {
    expect(ageRequestSchema.safeParse({ dateOfBirth }).success).toBe(false);
  },
);
