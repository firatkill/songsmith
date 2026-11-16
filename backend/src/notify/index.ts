import { z } from 'zod';
import {
  notificationKindSchema,
  notificationPayloadSchema,
  notificationPrefsSchema,
  deliveriesSchema,
  transactionalKinds,
  creativeKinds,
  type NotificationKind,
  type NotificationPrefs,
  type Json,
} from '@songsmith/schemas';
import { formatMessage as t } from '@songsmith/i18n';
import type { Service } from '../lib/auth.js';
import type { Logger } from '../lib/log.js';
import type { EmailSender } from './email.js';
import type { PushSender } from './push.js';
import { renderNotificationEmail } from './emails/notification.js';
export type NotificationEnqueue = (id: string) => Promise<void>;
export function channelSelection(
  kind: NotificationKind,
  prefs: NotificationPrefs,
  deviceCount: number,
) {
  return {
    push: prefs.push[kind] && deviceCount > 0,
    email:
      transactionalKinds.includes(kind) ||
      creativeKinds.some((k) => k === kind && prefs.email[k]),
  };
}
export function createNotify(service: Service, enqueue: NotificationEnqueue) {
  return async function notify(
    userId: string,
    kind: NotificationKind,
    payload: z.infer<typeof notificationPayloadSchema>,
    dedupeKey: string,
  ) {
    const input = {
      user_id: z.uuid().parse(userId),
      kind: notificationKindSchema.parse(kind),
      payload: notificationPayloadSchema.parse(payload),
      dedupe_key: z.string().min(1).max(200).parse(dedupeKey),
    };
    const insert = await service().from('notifications').upsert(input, {
      onConflict: 'user_id,kind,dedupe_key',
      ignoreDuplicates: true,
    });
    if (insert.error) throw new Error('Notification not saved');
    const row = await service()
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('kind', kind)
      .eq('dedupe_key', dedupeKey)
      .single();
    if (row.error) throw new Error('Notification unavailable');
    await enqueue(row.data.id);
    return row.data.id;
  };
}
export type Notify = ReturnType<typeof createNotify>;
// This boundary must never propagate a delivery/enqueue failure to a song job.
export async function notifySong(
  service: Service,
  notify: Notify,
  logger: Pick<Logger, 'warn'>,
  jobId: string,
) {
  try {
    const job = await service()
      .from('generation_jobs')
      .select('id,user_id,song_id,status')
      .eq('id', jobId)
      .single();
    if (job.error) throw new Error('Notification job unavailable');
    if (
      !['ready', 'refunded', 'failed'].includes(job.data.status) ||
      !job.data.song_id
    )
      return;
    const song = await service()
      .from('songs')
      .select('title')
      .eq('id', job.data.song_id)
      .single();
    if (song.error) throw new Error('Notification song unavailable');
    await notify(
      job.data.user_id,
      job.data.status === 'ready' ? 'song_ready' : 'song_failed',
      { jobId, songId: job.data.song_id, title: song.data.title },
      jobId,
    );
  } catch {
    logger.warn(
      { jobId, errorCode: 'INTERNAL' },
      'notification.enqueue_failed',
    );
  }
}
export function createDeliverNotification(deps: {
  service: Service;
  push: PushSender;
  email: EmailSender;
  webUrl: string;
  logger: Pick<Logger, 'info'>;
}) {
  return async function deliverNotification(id: string) {
    const { service } = deps;
    const result = await service()
      .from('notifications')
      .select('*')
      .eq('id', z.uuid().parse(id))
      .maybeSingle();
    if (result.error) throw new Error('Notification unavailable');
    if (!result.data) return;
    const row = result.data;
    const kind = notificationKindSchema.parse(row.kind),
      payload = notificationPayloadSchema.parse(row.payload),
      deliveries = deliveriesSchema.parse(row.deliveries);
    const [settings, profile, devices] = await Promise.all([
      service()
        .from('user_settings')
        .select('notification_prefs')
        .eq('user_id', row.user_id)
        .single(),
      service()
        .from('profiles')
        .select('locale')
        .eq('id', row.user_id)
        .single(),
      service()
        .schema('app')
        .from('devices')
        .select('id,expo_push_token')
        .eq('user_id', row.user_id),
    ]);
    if (settings.error || profile.error || devices.error)
      throw new Error('Notification context unavailable');
    const prefs = notificationPrefsSchema.parse(
        settings.data.notification_prefs,
      ),
      locale = z.enum(['tr', 'en']).parse(profile.data.locale);
    const selection = channelSelection(kind, prefs, devices.data.length);
    const save = async () => {
      const saved = await service()
        .from('notifications')
        .update({ deliveries: deliveries as Record<string, Json> })
        .eq('id', id);
      if (saved.error) throw new Error('Delivery not saved');
    };
    if (!deliveries.push || deliveries.push.status === 'failed') {
      if (!selection.push)
        deliveries.push = { status: 'skipped', sent: 0, failed: 0 };
      else {
        const outcomes = deliveries.push?.devices ?? {};
        for (const device of devices.data) {
          if (
            !device.expo_push_token ||
            outcomes[device.id] === 'sent' ||
            outcomes[device.id] === 'unregistered'
          )
            continue;
          let outcome: 'sent' | 'failed' | 'unregistered';
          try {
            outcome = await deps.push.send({
              to: device.expo_push_token,
              title: t(locale, `notification.kind.${kind}`),
              body: t(locale, `notification.text.${kind}`, {
                title: payload.title ?? '',
              }),
              data: payload.jobId ? { jobId: payload.jobId } : {},
            });
          } catch {
            outcome = 'failed';
          }
          if (outcome === 'unregistered') {
            const deleted = await service()
              .schema('app')
              .from('devices')
              .delete()
              .eq('id', device.id)
              .eq('user_id', row.user_id)
              .eq('expo_push_token', device.expo_push_token);
            if (deleted.error) throw new Error('Device cleanup failed');
          }
          outcomes[device.id] = outcome;
          const values = Object.values(outcomes);
          deliveries.push = {
            status: 'failed',
            sent: values.filter((v) => v === 'sent').length,
            failed: values.filter((v) => v !== 'sent').length,
            devices: outcomes,
          };
          await save();
        }
        const values = Object.values(outcomes);
        deliveries.push = {
          status: values.includes('failed') ? 'failed' : 'sent',
          sent: values.filter((v) => v === 'sent').length,
          failed: values.filter((v) => v !== 'sent').length,
          devices: outcomes,
        };
      }
      await save();
    }
    if (!deliveries.email || deliveries.email.status === 'failed') {
      if (!selection.email) deliveries.email = { status: 'skipped' };
      else {
        const recipient = await service().auth.admin.getUserById(row.user_id);
        if (recipient.error || !recipient.data.user.email)
          throw new Error('Recipient unavailable');
        const message = await renderNotificationEmail(
          locale,
          kind,
          payload,
          deps.webUrl,
        );
        await deps.email.send({
          id,
          to: recipient.data.user.email,
          ...message,
        });
        deliveries.email = { status: 'sent' };
      }
      await save();
    }
    if (deliveries.push.status === 'failed')
      throw new Error('Push delivery incomplete');
    deps.logger.info({ notificationId: id, kind }, 'notification.delivered');
  };
}
