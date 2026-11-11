import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { REALTIME_SUBSCRIBE_STATES, createClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';
import { z } from 'zod';
import type { Database } from '@songsmith/schemas';
import { createLogger } from '../../src/lib/log.js';
import {
  createQueues,
  queueDefinitions,
  type JobQueue,
} from '../../src/jobs/queues.js';
import { enqueue } from '../../src/jobs/enqueue.js';
import { runSteps, stepStore } from '../../src/jobs/steps.js';
import {
  ProcessorRegistry,
  startWorkers,
  type Processor,
} from '../../src/jobs/runtime.js';
import { sweepJobs } from '../../src/jobs/sweeper.js';
const status = z
  .object({
    API_URL: z.url(),
    ANON_KEY: z.string(),
    SERVICE_ROLE_KEY: z.string(),
  })
  .parse(
    JSON.parse(
      execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
        cwd: new URL('../../..', import.meta.url),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    ),
  );
if (new URL(status.API_URL).hostname !== '127.0.0.1')
  throw new Error('Local database required');
const client = createClient<Database>(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const service = () => client;
const store = stepStore(service);
const logger = createLogger('silent');
const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
if (!['localhost', '127.0.0.1'].includes(new URL(redisUrl).hostname))
  throw new Error('Local Redis required');
let userId: string;
beforeAll(async () => {
  const r = await client.auth.admin.createUser({
    email: `jobs+${randomUUID()}@example.test`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (r.error) throw r.error;
  userId = r.data.user.id;
});
afterAll(async () => {
  if (userId) await client.auth.admin.deleteUser(userId);
});
async function row(
  values: Partial<
    Database['public']['Tables']['generation_jobs']['Insert']
  > = {},
) {
  const r = await client
    .from('generation_jobs')
    .insert({
      user_id: userId,
      operation: 'generate',
      model_id: 'mock-music-a',
      idempotency_key: randomUUID(),
      correlation_id: randomUUID(),
      ...values,
    })
    .select()
    .single();
  if (r.error) throw r.error;
  return r.data;
}
async function fixture(processor: Processor, concurrency = 1) {
  const name = `test-${randomUUID()}`;
  const definitions = [{ name, concurrency }];
  const resources = createQueues(definitions, redisUrl, logger);
  const queue = resources.queues.get(name);
  if (!queue) throw new Error('Missing test queue');
  await queue.waitUntilReady();
  const registry = new ProcessorRegistry().register(
    name,
    'generate',
    processor,
  );
  const runtime = await startWorkers(
    definitions,
    redisUrl,
    registry,
    logger,
    resources.queues,
  );
  return {
    queue,
    async close() {
      await runtime.close();
      await queue.obliterate({ force: true });
      await resources.close();
    },
  };
}
function add(queue: JobQueue, id: string) {
  return Promise.resolve(
    enqueue(
      queue,
      'generate',
      { jobId: id, correlationId: randomUUID() },
      { jobId: id },
    ),
  );
}
async function completed(queue: JobQueue, id: string) {
  await expect
    .poll(async () => (await queue.getJob(id))?.getState(), {
      timeout: 15000,
      interval: 50,
    })
    .toBe('completed');
}
it('IT-07 retry resumes step two; duplicate enqueue creates one job', async () => {
  let first = 0,
    second = 0;
  const jobRow = await row({ heartbeat_at: '2000-01-01T00:00:00Z' });
  const f = await fixture((job) =>
    runSteps(
      job,
      [
        {
          name: 'first',
          run: () => {
            first++;
            return Promise.resolve({ kind: 'done', value: false });
          },
        },
        {
          name: 'second',
          run: () => {
            if (++second === 1)
              return Promise.reject(
                Object.assign(new Error('retry'), { retryable: true }),
              );
            return Promise.resolve({ kind: 'done', value: 2 });
          },
        },
        {
          name: 'third',
          run: () => Promise.resolve({ kind: 'done', value: { ok: true } }),
        },
      ],
      store,
    ),
  );
  try {
    await Promise.all([add(f.queue, jobRow.id), add(f.queue, jobRow.id)]);
    await completed(f.queue, jobRow.id);
    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(await f.queue.getJobCounts('completed')).toEqual({ completed: 1 });
    const saved = await client
      .from('generation_jobs')
      .select()
      .eq('id', jobRow.id)
      .single();
    expect(saved.data?.steps).toEqual({
      done: { first: false, second: 2, third: { ok: true } },
    });
    expect(Date.parse(saved.data?.heartbeat_at ?? '')).toBeGreaterThan(
      Date.parse(jobRow.heartbeat_at),
    );
  } finally {
    await f.close();
    await client.from('generation_jobs').delete().eq('id', jobRow.id);
  }
}, 20000);
it('IT-42 wait twice releases concurrency-1 slot; resumes and completes', async () => {
  const polling = await row(),
    other = await row();
  let polls = 0;
  const f = await fixture((job) =>
    runSteps(
      job,
      [
        {
          name: 'poll',
          run: () => {
            if (job.data.jobId === polling.id && ++polls <= 2)
              return Promise.resolve({ kind: 'wait', ms: 1500 });
            return Promise.resolve({ kind: 'done', value: 'finished' });
          },
        },
      ],
      store,
    ),
  );
  try {
    await add(f.queue, polling.id);
    await expect
      .poll(async () => (await f.queue.getJob(polling.id))?.getState())
      .toBe('delayed');
    await add(f.queue, other.id);
    await completed(f.queue, other.id);
    expect(await (await f.queue.getJob(polling.id))?.getState()).toBe(
      'delayed',
    );
    await completed(f.queue, polling.id);
    expect(polls).toBe(3);
    expect((await f.queue.getJob(polling.id))?.attemptsMade).toBe(1);
  } finally {
    await f.close();
    await client
      .from('generation_jobs')
      .delete()
      .in('id', [polling.id, other.id]);
  }
}, 20000);
it('IT-08 stale job resumes saved steps; third recovery fails and calls release hook', async () => {
  let first = 0;
  const stale = await row({
    status: 'running',
    heartbeat_at: '2000-01-01T00:00:00Z',
    steps: { done: { first: 1 } },
  });
  const exhausted = await row({
    status: 'running',
    heartbeat_at: '2000-01-01T00:00:00Z',
    recoveries: 2,
  });
  const released: string[] = [];
  const f = await fixture((job) =>
    runSteps(
      job,
      [
        {
          name: 'first',
          run: () => {
            first++;
            return Promise.resolve({ kind: 'done', value: 1 });
          },
        },
        {
          name: 'second',
          run: () => Promise.resolve({ kind: 'done', value: 2 }),
        },
      ],
      store,
    ),
  );
  try {
    await sweepJobs(
      service,
      new Map([['music:mock-music-a', f.queue]]),
      (id) => {
        released.push(id);
        return Promise.resolve();
      },
    );
    await completed(f.queue, stale.id);
    expect(first).toBe(0);
    const rows = await client
      .from('generation_jobs')
      .select()
      .in('id', [stale.id, exhausted.id]);
    expect(rows.data?.find((r) => r.id === stale.id)?.recoveries).toBe(1);
    expect(rows.data?.find((r) => r.id === exhausted.id)).toMatchObject({
      status: 'failed',
      recoveries: 3,
      error_code: 'PROVIDER_TIMEOUT',
    });
    expect(released).toEqual([exhausted.id]);
  } finally {
    await f.close();
    await client
      .from('generation_jobs')
      .delete()
      .in('id', [stale.id, exhausted.id]);
  }
});
it('IT-08 queued jobs recover after Redis FLUSHALL mid-run', async () => {
  const current = await row(),
    queued = await row();
  let entered = false;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = await fixture(async (job) => {
    if (job.data.jobId === current.id && !entered) {
      entered = true;
      await gate;
    }
    await runSteps(
      job,
      [
        {
          name: 'complete',
          run: () => Promise.resolve({ kind: 'done', value: true }),
        },
      ],
      store,
    );
  });
  const redis = new Redis(redisUrl);
  try {
    await add(f.queue, current.id);
    await add(f.queue, queued.id);
    await expect.poll(() => entered).toBe(true);
    await redis.flushall();
    release();
    // Let the in-flight processor observe its lost Redis lock before recovery.
    await expect
      .poll(
        async () =>
          (
            await client
              .from('generation_jobs')
              .select('steps')
              .eq('id', current.id)
              .single()
          ).data?.steps,
      )
      .toEqual({ done: { complete: true } });
    await sweepJobs(service, new Map([['music:mock-music-a', f.queue]]));
    await completed(f.queue, current.id);
    await completed(f.queue, queued.id);
  } finally {
    release();
    redis.disconnect();
    await f.close();
    await client
      .from('generation_jobs')
      .delete()
      .in('id', [current.id, queued.id]);
  }
}, 20000);
it('worker restart preserves exactly one scheduler per kind', async () => {
  const definitions = [{ name: 'maintenance', concurrency: 1 }];
  const resources = createQueues(definitions, redisUrl, logger);
  const queue = resources.queues.get('maintenance');
  if (!queue) throw new Error('queue missing');
  const registry = new ProcessorRegistry()
    .register('maintenance', 'sweeper', () => {
      return Promise.resolve();
    })
    .register('maintenance', 'nightly', () => {
      return Promise.resolve();
    });
  let runtime: Awaited<ReturnType<typeof startWorkers>> | undefined;
  try {
    runtime = await startWorkers(
      definitions,
      redisUrl,
      registry,
      logger,
      resources.queues,
    );
    await runtime.close();
    runtime = undefined;
    runtime = await startWorkers(
      definitions,
      redisUrl,
      registry,
      logger,
      resources.queues,
    );
    const schedules = await queue.getJobSchedulers();
    expect(schedules.map((s) => s.key).sort()).toEqual(['nightly', 'sweeper']);
    expect(schedules.find((s) => s.key === 'nightly')).toMatchObject({
      pattern: '0 3 * * *',
      tz: 'Europe/Istanbul',
    });
  } finally {
    await runtime?.close();
    await queue.obliterate({ force: true });
    await resources.close();
  }
});
it('catalogue queues and configured/default concurrency', async () => {
  const definitions = await queueDefinitions(service);
  expect(definitions).toEqual(
    expect.arrayContaining([
      { name: 'music:mock-music-a', concurrency: 4 },
      { name: 'music:mock-music-b', concurrency: 4 },
      { name: 'media', concurrency: 4 },
      { name: 'video', concurrency: 1 },
      { name: 'account', concurrency: 2 },
      { name: 'maintenance', concurrency: 1 },
    ]),
  );
});
it('Realtime delivers processor stage updates only to the job owner', async () => {
  const identities: string[] = [];
  const sessions: ReturnType<typeof createClient<Database>>[] = [];
  const events: Record<string, unknown>[][] = [[], []];
  let f: Awaited<ReturnType<typeof fixture>> | undefined;
  let jobId: string | undefined;
  try {
    for (let i = 0; i < 2; i++) {
      const email = `realtime+${randomUUID()}@example.test`,
        password = randomUUID();
      const user = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (user.error) throw user.error;
      identities.push(user.data.user.id);
      const auth = createClient<Database>(status.API_URL, status.ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      sessions.push(auth);
      const signed = await auth.auth.signInWithPassword({ email, password });
      if (signed.error) throw signed.error;
      await auth.realtime.setAuth(signed.data.session.access_token);
    }
    const owner = identities[0];
    if (!owner) throw new Error('Owner missing');
    const r = await row({ user_id: owner });
    jobId = r.id;
    await Promise.all(
      sessions.map(
        (auth, i) =>
          new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Realtime subscription timeout'));
            }, 10000);
            // Both users deliberately request the owner's row: isolation is RLS, not
            // a client-side user filter hiding the other user's updates.
            auth
              .channel(`jobs-${randomUUID()}`, {
                config: {
                  postgres_changes_options: { wait: true, timeout: 10000 },
                },
              })

              .on(
                'postgres_changes',
                {
                  event: 'UPDATE',
                  schema: 'public',
                  table: 'generation_jobs',
                  filter: `id=eq.${r.id}`,
                },
                (payload) => {
                  events[i]?.push(payload.new);
                },
              )
              .subscribe((state) => {
                if (state === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
                  clearTimeout(timeout);
                  resolve();
                } else if (
                  state === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
                  state === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
                ) {
                  clearTimeout(timeout);
                  reject(new Error('Realtime subscribe failed'));
                }
              });
          }),
      ),
    );
    f = await fixture((job) =>
      runSteps(
        job,
        [
          {
            name: 'generating',
            run: () => Promise.resolve({ kind: 'done', value: true }),
          },
        ],
        store,
      ),
    );
    await add(f.queue, r.id);
    await completed(f.queue, r.id);
    await expect
      .poll(() => events[0]?.some((e) => e['stage_detail'] === 'generating'), {
        timeout: 10000,
      })
      .toBe(true);
    // Observe a bounded window after owner delivery to catch unauthorized delivery.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(events[1]).toEqual([]);
  } finally {
    await f?.close();
    await Promise.all(sessions.map((s) => s.removeAllChannels()));
    if (jobId) await client.from('generation_jobs').delete().eq('id', jobId);
    for (const id of identities) await client.auth.admin.deleteUser(id);
  }
}, 20000);
