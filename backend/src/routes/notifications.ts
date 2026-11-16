import { z } from 'zod';
import {
  settingsSchema,
  settingsRequestSchema,
  mergeNotificationPrefs,
  notificationKindSchema,
  notificationPayloadSchema,
  notificationsResponseSchema,
  notificationQuerySchema,
  notificationReadSchema,
  deviceRequestSchema,
  expoPushTokenSchema,
} from '@songsmith/schemas';
import { caller, type Service } from '../lib/auth.js';
import { defineRoute, type RouteContext } from '../lib/route.js';
import { AppError } from '../lib/errors.js';
export function registerNotifications(context: RouteContext, service: Service) {
  const empty = { params: z.object({}), query: z.object({}) };
  const ok = z.object({ ok: z.literal(true) });
  defineRoute(context, {
    method: 'get',
    path: '/me/notifications',
    auth: 'required',
    request: { ...empty, query: notificationQuerySchema },
    response: { 200: notificationsResponseSchema },
    handler: async ({ query }) => {
      const userId = caller().userId;
      let list = service()
        .from('notifications')
        .select('id,kind,payload,read_at,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(query.limit + 1);
      if (query.cursor) {
        const [time, id] = query.cursor.split('~');
        const timestamp = z.iso.datetime({ offset: true }).parse(time);
        const uuid = z.uuid().parse(id);
        list = list.or(
          `created_at.lt.${timestamp},and(created_at.eq.${timestamp},id.lt.${uuid})`,
        );
      }
      const [rows, count] = await Promise.all([
        list,
        service()
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .is('read_at', null),
      ]);
      if (rows.error || count.error) throw new AppError('INTERNAL');
      const items = rows.data.slice(0, query.limit).map((r) => ({
        id: r.id,
        kind: notificationKindSchema.parse(r.kind),
        payload: notificationPayloadSchema.parse(r.payload),
        readAt: r.read_at,
        createdAt: r.created_at,
      }));
      const last = items.at(-1);
      return {
        status: 200,
        body: {
          items,
          nextCursor:
            rows.data.length > query.limit && last
              ? `${last.createdAt}~${last.id}`
              : null,
          unread: count.count ?? 0,
        },
      };
    },
  });
  defineRoute(context, {
    method: 'post',
    path: '/me/notifications/read',
    auth: 'required',
    rateLimit: { key: 'notifications_read', by: 'user' },
    request: { ...empty, body: notificationReadSchema },
    response: { 200: ok },
    handler: async ({ body }) => {
      let update = service()
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', caller().userId)
        .is('read_at', null);
      if ('ids' in body) update = update.in('id', body.ids);
      if ((await update).error) throw new AppError('INTERNAL');
      return { status: 200, body: { ok: true } };
    },
  });
  defineRoute(context, {
    method: 'put',
    path: '/me/settings',
    auth: 'required',
    rateLimit: { key: 'me_settings', by: 'user' },
    request: { ...empty, body: settingsRequestSchema },
    response: { 200: settingsSchema },
    handler: async ({ body }) => {
      const userId = caller().userId;
      const current = await service()
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (current.error) throw new AppError('INTERNAL');
      const result = await service()
        .from('user_settings')
        .update({
          ...(body.notificationPrefs
            ? {
                notification_prefs: mergeNotificationPrefs(
                  current.data.notification_prefs,
                  body.notificationPrefs,
                ),
              }
            : {}),
          ...(body.marketingEmailOptIn === undefined
            ? {}
            : { marketing_email_opt_in: body.marketingEmailOptIn }),
        })
        .eq('user_id', userId)
        .select('*')
        .single();
      if (result.error) throw new AppError('INTERNAL');
      return { status: 200, body: settingsSchema.parse(result.data) };
    },
  });
  defineRoute(context, {
    method: 'post',
    path: '/me/devices',
    auth: 'required',
    rateLimit: { key: 'me_devices', by: 'user' },
    request: { ...empty, body: deviceRequestSchema },
    response: { 200: ok },
    handler: async ({ body }) => {
      const result = await service().schema('app').from('devices').upsert(
        {
          user_id: caller().userId,
          platform: body.platform,
          expo_push_token: body.expoPushToken,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'expo_push_token' },
      );
      if (result.error) throw new AppError('INTERNAL');
      return { status: 200, body: { ok: true } };
    },
  });
  defineRoute(context, {
    method: 'delete',
    path: '/me/devices/:token',
    auth: 'required',
    rateLimit: { key: 'me_devices_delete', by: 'user' },
    request: { ...empty, params: z.object({ token: expoPushTokenSchema }) },
    response: { 200: ok },
    handler: async ({ params }) => {
      const result = await service()
        .schema('app')
        .from('devices')
        .delete()
        .eq('user_id', caller().userId)
        .eq('expo_push_token', params.token);
      if (result.error) throw new AppError('INTERNAL');
      return { status: 200, body: { ok: true } };
    },
  });
}
