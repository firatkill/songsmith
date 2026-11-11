import { recoveryRowsSchema, musicAdapterSchema } from '@songsmith/schemas';
import { randomUUID } from 'node:crypto';
import type { Service } from '../lib/auth.js';
import type { JobQueue } from './queues.js';
import { enqueue } from './enqueue.js';
// T-17 owns reservation expiry and release/refund. This hook intentionally
// performs no ledger operations until that task supplies the implementation.
export const onJobFailedReleaseCredits: (jobId: string) => Promise<void> = () =>
  Promise.resolve();
export async function sweepJobs(
  service: Service,
  queues: Map<string, JobQueue>,
  release = onJobFailedReleaseCredits,
) {
  // Keyset pagination avoids PostgREST's row cap and mutations shifting offsets.
  let after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const result = await service()
      .from('generation_jobs')
      .select('id,status,heartbeat_at,model_id,operation,correlation_id')
      .in('status', ['queued', 'moderating', 'running', 'finishing'])
      .gt('id', after)
      .order('id')
      .limit(100);
    if (result.error) throw new Error('Recovery scan failed');
    const rows = recoveryRowsSchema.parse(result.data);
    if (!rows.length) break;
    for (const row of rows) {
      after = row.id;
      const stale = Date.parse(row.heartbeat_at) < Date.now() - 15 * 60_000;
      if (!stale && row.status !== 'queued') continue;
      let name: string;
      let processor = row.operation;
      if (['generate', 'extend', 'remix', 'stems'].includes(row.operation)) {
        if (!row.model_id) continue; // T-19 must persist routing before enqueue.
        const model = await service()
          .from('models')
          .select('adapter')
          .eq('id', row.model_id)
          .single();
        if (model.error) throw new Error('Recovery catalogue lookup failed');
        name = `music:${musicAdapterSchema.parse(model.data).adapter}`;
      } else if (row.operation === 'video') {
        name = 'video';
        processor = 'render';
      } else if (['cover', 'align'].includes(row.operation)) name = 'media';
      else continue; // Lyrics/rewrite are synchronous, not background jobs.
      const queue = queues.get(name);
      if (!queue) throw new Error('Recovery queue unavailable');
      const existing = await queue.getJob(row.id);
      const state = existing ? await existing.getState() : 'unknown';
      if (existing && state !== 'failed') continue;
      if (existing && !stale) continue;
      if (stale) {
        const recovery = await service()
          .schema('app')
          .rpc('record_job_recovery', { job_id: row.id });
        if (recovery.error) throw new Error('Recovery claim failed');
        // SQL returns NULL if a concurrent heartbeat/recovery won. Generated
        // RPC types do not represent nullable scalar return values.
        if ((recovery.data as number | null) === null) continue;
        if (recovery.data > 2) {
          const failed = await service()
            .from('generation_jobs')
            .update({ status: 'failed', error_code: 'PROVIDER_TIMEOUT' })
            .eq('id', row.id)
            .in('status', ['queued', 'moderating', 'running', 'finishing']);
          if (failed.error) throw new Error('Recovery finalization failed');
          await release(row.id);
          continue;
        }
      }
      if (existing) await existing.remove();
      await enqueue(
        queue,
        processor,
        { jobId: row.id, correlationId: row.correlation_id ?? randomUUID() },
        { jobId: row.id },
      );
    }
  }
}
