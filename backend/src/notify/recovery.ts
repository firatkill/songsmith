import type { Service } from '../lib/auth.js';
import type { Logger } from '../lib/log.js';
import type { JobQueue } from '../jobs/queues.js';
import { enqueue } from '../jobs/enqueue.js';
import { createNotify, notifySong } from './index.js';
// Only recent work is recovered: older jobs (for example songs made before
// T-21) never get a late notification, and a delivery that keeps failing is
// retried for one day, not forever.
export const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;
// Postgres survives Redis loss and the gap between song completion and enqueue.
export async function recoverNotifications(
  service: Service,
  queues: Map<string, JobQueue>,
  logger: Pick<Logger, 'warn'>,
  now: Date = new Date(),
) {
  const queue = queues.get('notify');
  if (!queue) return;
  const since = new Date(now.getTime() - RECOVERY_WINDOW_MS).toISOString();
  const add = async (id: string) => {
    const existing = await queue.getJob(id);
    if (existing) {
      if ((await existing.getState()) !== 'failed') return;
      await existing.remove();
    }
    await enqueue(queue, 'deliver', { jobId: id }, { jobId: id });
  };
  const notify = createNotify(service, add);
  let after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const jobs = await service()
      .from('generation_jobs')
      .select('id')
      .eq('operation', 'generate')
      .in('status', ['ready', 'failed', 'refunded'])
      .gte('heartbeat_at', since)
      .gt('id', after)
      .order('id')
      .limit(100);
    if (jobs.error) throw new Error('Notification recovery failed');
    if (!jobs.data.length) break;
    for (const job of jobs.data) {
      after = job.id;
      const found = await service()
        .from('notifications')
        .select('id')
        .eq('dedupe_key', job.id)
        .in('kind', ['song_ready', 'song_failed'])
        .limit(1);
      if (found.error) throw new Error('Notification lookup failed');
      if (!found.data.length) await notifySong(service, notify, logger, job.id);
    }
  }
  after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const rows = await service()
      .from('notifications')
      .select('id,deliveries')
      .gte('created_at', since)
      .gt('id', after)
      .order('id')
      .limit(100);
    if (rows.error) throw new Error('Delivery recovery failed');
    if (!rows.data.length) break;
    for (const row of rows.data) {
      after = row.id;
      const d = row.deliveries as {
        push?: { status?: string };
        email?: { status?: string };
      };
      if (
        !d.push ||
        !d.email ||
        d.push.status === 'failed' ||
        d.email.status === 'failed'
      )
        await add(row.id);
    }
  }
}
