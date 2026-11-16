import { z } from 'zod';
export const notificationKindSchema = z.enum([
  'song_ready',
  'song_failed',
  'stems_ready',
  'video_ready',
  'gift_opened',
  'report_decision',
  'moderation_notice',
  'topup_receipt',
  'topup_prompt',
  'export_ready',
  'account_deleted',
]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;
export const creativeKinds = [
  'song_ready',
  'song_failed',
  'stems_ready',
  'video_ready',
  'gift_opened',
] as const;
export const transactionalKinds: readonly NotificationKind[] = [
  'topup_receipt',
  'export_ready',
  'account_deleted',
  'moderation_notice',
  'report_decision',
];
const push = z.strictObject({
  song_ready: z.boolean().default(true),
  song_failed: z.boolean().default(true),
  stems_ready: z.boolean().default(true),
  video_ready: z.boolean().default(true),
  gift_opened: z.boolean().default(true),
  report_decision: z.boolean().default(false),
  moderation_notice: z.boolean().default(false),
  topup_receipt: z.boolean().default(false),
  topup_prompt: z.boolean().default(false),
  export_ready: z.boolean().default(false),
  account_deleted: z.boolean().default(false),
});
const email = z.strictObject({
  song_ready: z.boolean().default(false),
  song_failed: z.boolean().default(false),
  stems_ready: z.boolean().default(false),
  video_ready: z.boolean().default(false),
  gift_opened: z.boolean().default(false),
});
export const notificationPrefsSchema = z.strictObject({
  push: push.prefault({}),
  email: email.prefault({}),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;
export const notificationPrefsPatchSchema = z.strictObject({
  push: z
    .strictObject(
      Object.fromEntries(
        Object.keys(push.shape).map((k) => [k, z.boolean().optional()]),
      ) as { [K in keyof typeof push.shape]: z.ZodOptional<z.ZodBoolean> },
    )
    .optional(),
  email: z
    .strictObject(
      Object.fromEntries(
        Object.keys(email.shape).map((k) => [k, z.boolean().optional()]),
      ) as { [K in keyof typeof email.shape]: z.ZodOptional<z.ZodBoolean> },
    )
    .optional(),
});
export function mergeNotificationPrefs(
  current: unknown,
  patch: z.infer<typeof notificationPrefsPatchSchema> = {},
): NotificationPrefs {
  const prefs = notificationPrefsSchema.parse(current);
  return notificationPrefsSchema.parse({
    push: { ...prefs.push, ...patch.push },
    email: { ...prefs.email, ...patch.email },
  });
}
export const settingsRequestSchema = z
  .strictObject({
    notificationPrefs: notificationPrefsPatchSchema.optional(),
    marketingEmailOptIn: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
export const notificationPayloadSchema = z.object({
  jobId: z.uuid().optional(),
  songId: z.uuid().nullable().optional(),
  title: z.string().max(200).optional(),
});
export const notificationSchema = z.object({
  id: z.uuid(),
  kind: notificationKindSchema,
  payload: notificationPayloadSchema,
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;
export const notificationsResponseSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
  unread: z.number().int().nonnegative(),
});
export const notificationQuerySchema = z.object({
  cursor: z
    .string()
    .max(100)
    .regex(/^[0-9TZ:.+-]+~[0-9a-f-]{36}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const notificationReadSchema = z.union([
  z.strictObject({ ids: z.array(z.uuid()).min(1).max(100) }),
  z.strictObject({ all: z.literal(true) }),
]);
export const expoPushTokenSchema = z
  .string()
  .max(256)
  .regex(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/);
export const deviceRequestSchema = z.strictObject({
  platform: z.enum(['ios', 'android']),
  expoPushToken: expoPushTokenSchema,
});
export const deliveryResultSchema = z.object({
  status: z.enum(['sent', 'skipped', 'failed']),
  sent: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative().optional(),
});
export const deliveriesSchema = z.object({
  push: deliveryResultSchema
    .extend({
      devices: z
        .record(z.string(), z.enum(['sent', 'failed', 'unregistered']))
        .optional(),
    })
    .optional(),
  email: deliveryResultSchema.optional(),
});
export const expoTicketSchema = z.object({
  data: z.object({
    status: z.enum(['ok', 'error']),
    details: z.object({ error: z.string().optional() }).optional(),
  }),
});
