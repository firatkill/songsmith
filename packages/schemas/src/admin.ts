import { z } from 'zod';

// Admin API (T-12). Staff + AAL2 only; every mutation writes app.audit_log.
export const staffRoleSchema = z.enum(['moderator', 'admin']);
export const adminWhoamiSchema = z.object({
  userId: z.uuid(),
  roles: z.array(staffRoleSchema).min(1),
});

export const adminModelSchema = z.object({
  id: z.string(),
  kind: z.enum(['music', 'text', 'image', 'alignment']),
  adapter: z.string(),
  displayName: z.string(),
  enabled: z.boolean(),
  qualityRank: z.number().int(),
  isMock: z.boolean(),
  // Enabled, registered, capabilities match, breaker not open, no kill switch.
  usable: z.boolean(),
  prices: z.array(
    z.object({
      operation: z.string(),
      credits: z.number().int(),
      estCostMicroUsd: z.number().int(),
    }),
  ),
  languages: z.array(
    z.object({
      language: z.string(),
      status: z.enum(['unverified', 'beta', 'verified']),
    }),
  ),
});
export const adminCatalogueSchema = z.object({
  models: z.array(adminModelSchema),
});
export const adminModelPatchSchema = z
  .strictObject({
    enabled: z.boolean().optional(),
    qualityRank: z.number().int().min(0).max(1000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to change',
  });

export const adminFlagSchema = z.object({
  key: z.string(),
  description: z.string(),
  public: z.boolean(),
  placeholder: z.boolean(),
  // How the console edits the value; the server validates with the flag registry.
  type: z.enum(['boolean', 'number', 'json']),
  value: z.unknown(),
  defaultValue: z.unknown(),
  isDefault: z.boolean(),
});
export const adminFlagsSchema = z.object({ flags: z.array(adminFlagSchema) });
export const adminFlagPutSchema = z.strictObject({ value: z.unknown() });
