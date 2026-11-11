import { z } from 'zod';

// Provisional until the legal drafts in T-40.
export const consentVersions = {
  terms: '2026-11-01',
  privacy: '2026-11-01',
  ai_disclosure: '2026-11-01',
  marketing: '2026-11-01',
  analytics: '2026-11-01',
} as const;
export const consentKindSchema = z.enum([
  'terms',
  'privacy',
  'ai_disclosure',
  'marketing',
  'analytics',
]);
export type ConsentKind = z.infer<typeof consentKindSchema>;
export const reservedHandles = [
  'admin',
  'support',
  'songsmith',
  'staff',
  'moderator',
  'api',
  'www',
] as const;
export const handleSchema = z
  .string()
  .regex(/^[a-z0-9_]{3,30}$/)
  .refine(
    (v) => !v.startsWith('user_') && !reservedHandles.some((h) => h === v),
  );
export const patchMeSchema = z
  .strictObject({
    handle: handleSchema.optional(),
    locale: z.enum(['tr', 'en']).optional(),
    remix_default: z.boolean().optional(),
    explicit_hidden: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
export const ageRequestSchema = z.strictObject({ dateOfBirth: z.iso.date() });
export const consentRequestSchema = z
  .strictObject({
    kind: consentKindSchema,
    version: z.string(),
    granted: z.boolean(),
    source: z.enum(['web', 'ios', 'android']),
  })
  .refine((v) => v.version === consentVersions[v.kind], { path: ['version'] });
export const profileSchema = z.object({
  id: z.uuid(),
  handle: z.string(),
  display_name: z.string(),
  bio: z.string(),
  avatar_seed: z.string(),
  locale: z.enum(['tr', 'en']),
  is_adult: z.boolean(),
  adult_verified_at: z.string().nullable(),
  remix_default: z.boolean(),
  explicit_hidden: z.boolean(),
  status: z.enum(['active', 'cooldown', 'suspended', 'banned', 'deleted']),
  created_at: z.string(),
  updated_at: z.string(),
});
export const settingsSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  notification_prefs: z.record(z.string(), z.unknown()),
  marketing_email_opt_in: z.boolean(),
  analytics_consent: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const consentRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  kind: consentKindSchema,
  version: z.string(),
  granted: z.boolean(),
  source: z.enum(['web', 'ios', 'android']),
  at: z.string(),
  created_at: z.string(),
});
export const consentStateSchema = consentRowSchema.extend({
  isCurrent: z.boolean(),
});
export const consentsResponseSchema = z.object({
  consents: z.array(consentStateSchema),
});
export const meResponseSchema = consentsResponseSchema.extend({
  profile: profileSchema,
  settings: settingsSchema,
  needsAgeGate: z.boolean(),
  missingConsents: z.array(consentKindSchema),
});
export const jwtClaimsSchema = z.object({
  sub: z.uuid(),
  role: z.literal('authenticated'),
  exp: z.number().int(),
});
