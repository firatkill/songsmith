import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { DelayedError, UnrecoverableError } from 'bullmq';
import { jobDataSchema } from '@songsmith/schemas';
import { defaultJobOptions, physicalQueueName } from '../queues.js';
import { runSteps, type StepStore } from '../steps.js';
import { loadEnv } from '../../lib/env.js';
it('queue defaults and physical names', () => {
  expect(defaultJobOptions).toEqual({
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  });
  expect(physicalQueueName('music:mock-music-a')).toBe('music-mock-music-a');
});
it('strict IDs-only job data', () => {
  const data = { jobId: randomUUID(), correlationId: randomUUID() };
  expect(jobDataSchema.parse(data)).toEqual(data);
  expect(jobDataSchema.safeParse({ ...data, lyrics: 'private' }).success).toBe(
    false,
  );
  expect(jobDataSchema.safeParse({ ...data, jobId: 'bad' }).success).toBe(
    false,
  );
});
it('Redis default locally and required in production', () => {
  const env = {
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_ANON_KEY: 'local',
    SUPABASE_SERVICE_ROLE_KEY: 'local',
  };
  expect(loadEnv(env).REDIS_URL).toBe('redis://localhost:6379');
  expect(() =>
    loadEnv({ ...env, APP_ENV: 'production', PROVIDER_MODE: 'live' }),
  ).toThrow('REDIS_URL');
});
function fixture() {
  const job = {
    data: { jobId: randomUUID(), correlationId: randomUUID() },
    token: 'lock',
    moveToDelayed: vi.fn(() => {
      return Promise.resolve();
    }),
  };
  const store: StepStore = {
    load: vi.fn(() => Promise.resolve({ done: { first: false } })),
    touch: vi.fn(() => {
      return Promise.resolve();
    }),
    save: vi.fn(() => {
      return Promise.resolve();
    }),
  };
  return { job, store };
}
it('skips false/null saved results and saves before next step', async () => {
  const { job, store } = fixture();
  const skipped = vi.fn();
  const order: string[] = [];
  store.save = () => {
    order.push('save');
    return Promise.resolve();
  };
  await runSteps(
    job,
    [
      { name: 'first', run: skipped },
      {
        name: 'second',
        run: () => Promise.resolve({ kind: 'done', value: null }),
      },
      {
        name: 'third',
        run: (state) => {
          expect(state.done['second']).toBeNull();
          order.push('third');
          return Promise.resolve({ kind: 'done', value: 3 });
        },
      },
    ],
    store,
  );
  expect(skipped).not.toHaveBeenCalled();
  expect(order).toEqual(['save', 'third', 'save']);
});
it('delays with lock and never saves wait; nonretryable stops retries', async () => {
  const { job, store } = fixture();
  await expect(
    runSteps(
      job,
      [{ name: 'poll', run: () => Promise.resolve({ kind: 'wait', ms: 100 }) }],
      store,
    ),
  ).rejects.toBeInstanceOf(DelayedError);
  expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'lock');
  expect(store.save).not.toHaveBeenCalled();
  await expect(
    runSteps(
      job,
      [
        {
          name: 'poll',
          run: () => {
            return Promise.reject(
              Object.assign(new Error('terminal'), { retryable: false }),
            );
          },
        },
      ],
      store,
    ),
  ).rejects.toBeInstanceOf(UnrecoverableError);
});
it('persistence failure prevents the next step', async () => {
  const { job, store } = fixture();
  store.save = () => {
    return Promise.reject(new Error('database unavailable'));
  };
  const next = vi.fn();
  await expect(
    runSteps(
      job,
      [
        {
          name: 'second',
          run: () => Promise.resolve({ kind: 'done', value: 1 }),
        },
        { name: 'third', run: next },
      ],
      store,
    ),
  ).rejects.toThrow('database unavailable');
  expect(next).not.toHaveBeenCalled();
});
