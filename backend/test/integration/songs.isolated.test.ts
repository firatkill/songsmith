// IT-15..IT-19 (T-19). Isolated: workers consume the real music queues, and
// IT-18 changes a kill switch and a catalogue price (restored in finally).
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  consentVersions,
  errorResponseSchema,
  jobResponseSchema,
  type Database,
} from '@songsmith/schemas';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/lib/env.js';
import { createFlags } from '../../src/lib/flags.js';
import { createLogger } from '../../src/lib/log.js';
import { createRegistry } from '../../src/models/registry.js';
import { enqueue } from '../../src/jobs/enqueue.js';
import { createQueues, queueDefinitions } from '../../src/jobs/queues.js';
import { ProcessorRegistry, startWorkers } from '../../src/jobs/runtime.js';
import { createGenerateSong } from '../../src/songs/generate.js';
import { readMp3Tags } from '../../src/media/tags.js';
import { serve } from '../http.js';

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
  throw new Error('Local Supabase required');
const redisUrl = process.env['REDIS_URL']?.trim() || 'redis://localhost:6379';
if (!['localhost', '127.0.0.1'].includes(new URL(redisUrl).hostname))
  throw new Error('Local Redis required');
const client = createClient<Database>(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const env = loadEnv({
  APP_ENV: 'ci',
  SUPABASE_URL: status.API_URL,
  SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  MOCK_LATENCY_MS: '20',
  REDIS_URL: redisUrl,
});
const service = () => client;
const logger = createLogger('silent');
const flags = createFlags(service, logger);
const users: string[] = [];
let queues: ReturnType<typeof createQueues>;
let workers: Awaited<ReturnType<typeof startWorkers>>;
let models: Awaited<ReturnType<typeof createRegistry>>;
let http: Awaited<ReturnType<typeof serve>>;
// Jobs from the "parked" app stay queued until a test enqueues them.
let parked: Awaited<ReturnType<typeof serve>>;

beforeAll(async () => {
  const definitions = (await queueDefinitions(service, flags)).filter((d) =>
    d.name.startsWith('music:'),
  );
  // Two attempts with a short backoff keep IT-16 within the test timeout.
  queues = createQueues(definitions, redisUrl, logger, {
    attempts: 2,
    backoff: { type: 'fixed', delay: 50 },
    removeOnComplete: true,
    removeOnFail: true,
  });
  for (const queue of queues.queues.values()) {
    await queue.waitUntilReady();
    await queue.obliterate({ force: true });
  }
  models = await createRegistry(service, env, flags, logger);
  const generateSong = createGenerateSong({
    service,
    models: () => Promise.resolve(models),
    logger,
  });
  const registry = new ProcessorRegistry();
  for (const { name } of definitions)
    registry.register(name, 'generate', generateSong);
  workers = await startWorkers(
    definitions,
    redisUrl,
    registry,
    logger,
    queues.queues,
  );
  const add = async (
    queue: string,
    name: string,
    data: { jobId: string; correlationId: string },
  ) => {
    const target = queues.queues.get(queue);
    if (!target) throw new Error('queue missing');
    await enqueue(target, name, data, { jobId: data.jobId });
  };
  http = await serve(createApp({ env, logger, enqueue: add }));
  parked = await serve(
    createApp({ env, logger, enqueue: () => Promise.resolve() }),
  );
});
afterAll(async () => {
  await http.close();
  await parked.close();
  await workers.close();
  for (const queue of queues.queues.values())
    await queue.obliterate({ force: true });
  await queues.close();
  for (const id of users) await client.auth.admin.deleteUser(id);
});

async function user() {
  const email = `songs-it+${randomUUID()}@example.test`;
  const password = randomUUID();
  const created = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const id = created.data.user.id;
  users.push(id);
  const adult = await client
    .from('profiles')
    .update({ is_adult: true, adult_verified_at: new Date().toISOString() })
    .eq('id', id);
  if (adult.error) throw adult.error;
  const consent = await client.schema('app').rpc('record_consent', {
    p_user_id: id,
    p_kind: 'ai_disclosure',
    p_version: consentVersions.ai_disclosure,
    p_granted: true,
    p_source: 'web',
  });
  if (consent.error) throw consent.error;
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id, token: signed.data.session.access_token };
}
const song = (extra: object = {}) => ({
  title: `Song ${randomUUID()}`,
  description: 'A warm acoustic song about the sea',
  language: 'en',
  durationSec: 30,
  sections: [{ tag: '[Verse]', lines: ['The sea is calm tonight'] }],
  ...extra,
});
function post(
  server: { url: string },
  token: string,
  body: unknown,
  key = randomUUID(),
) {
  return fetch(`${server.url}/v1/songs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body),
  });
}
async function job(token: string, id: string) {
  const response = await fetch(`${http.url}/v1/jobs/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  return jobResponseSchema.parse(await response.json());
}
async function settled(token: string, id: string) {
  await expect
    .poll(async () => (await job(token, id)).status, {
      timeout: 20000,
      interval: 100,
    })
    .toMatch(/^(ready|refunded|failed)$/u);
  return job(token, id);
}
async function balance(id: string) {
  const row = await client
    .schema('app')
    .from('credit_accounts')
    .select('balance,held')
    .eq('user_id', id)
    .single();
  if (row.error) throw row.error;
  return row.data;
}
async function songRow(id: string) {
  const row = await client
    .from('songs')
    .select('status,model_id,credit_cost,duration_ms')
    .eq('id', id)
    .single();
  if (row.error) throw row.error;
  return row.data;
}
async function setFlag(key: string, value: unknown) {
  const result = await client
    .schema('app')
    .from('flags')
    .upsert({ key, value: value as never });
  if (result.error) throw result.error;
}
async function clearFlag(key: string) {
  await client.schema('app').from('flags').delete().eq('key', key);
}
function refresh() {
  flags.invalidate();
  models.invalidate();
}

describe('POST /v1/songs', () => {
  it('IT-15 generates on mock-music-a: stored, tagged, charged once', async () => {
    const { id, token } = await user();
    const before = await balance(id);
    const response = await post(http, token, song());
    expect(response.status).toBe(202);
    const started = jobResponseSchema.parse(await response.json());
    expect(started.modelId).toBe('mock-music-a');
    expect(started.routeReason).toEqual({ kind: 'auto' });
    const done = await settled(token, started.jobId);
    expect(done.status).toBe('ready');
    expect(done.songId).not.toBeNull();
    const row = await songRow(done.songId ?? '');
    expect(row).toMatchObject({
      status: 'ready',
      model_id: 'mock-music-a',
      credit_cost: 10,
    });
    expect(row.duration_ms).toBeGreaterThan(0);
    expect(await balance(id)).toEqual({
      balance: before.balance - 10,
      held: 0,
    });
    const asset = await client
      .from('song_assets')
      .select('kind,bucket,path')
      .eq('song_id', done.songId ?? '')
      .single();
    expect(asset.data).toEqual({
      kind: 'audio_mp3',
      bucket: 'private-media',
      path: `songs/${done.songId ?? ''}/audio.mp3`,
    });
    const file = await client.storage
      .from('private-media')
      .download(`songs/${done.songId ?? ''}/audio.mp3`);
    expect(file.error).toBeNull();
    const tags = readMp3Tags(
      new Uint8Array(await (file.data as Blob).arrayBuffer()),
    );
    expect(tags.comment?.text).toBe('AI-generated with mock-music-a');
    expect(tags.userDefinedText).toEqual(
      expect.arrayContaining([
        { description: 'ai_generated', value: 'true' },
        { description: 'model', value: 'mock-music-a' },
      ]),
    );
  }, 30000);

  it('IT-15 generates on async mock-music-b (pending, then polled)', async () => {
    const { token } = await user();
    // Turkish is unverified on mock-music-a, so Auto routes to mock-music-b.
    const response = await post(
      http,
      token,
      song({
        language: 'tr',
        sections: [{ tag: '[Verse]', lines: ['Deniz bu gece sakin'] }],
      }),
    );
    expect(response.status).toBe(202);
    const started = jobResponseSchema.parse(await response.json());
    expect(started.modelId).toBe('mock-music-b');
    const done = await settled(token, started.jobId);
    expect(done.status).toBe('ready');
    const steps = await client
      .from('generation_jobs')
      .select('steps')
      .eq('id', started.jobId)
      .single();
    expect(
      (steps.data?.steps as { done: { provider_start: { kind: string } } }).done
        .provider_start.kind,
    ).toBe('pending');
  }, 30000);

  it('IT-17 an Idempotency-Key replay returns the same job and charges once', async () => {
    const { id, token } = await user();
    const before = await balance(id);
    const key = randomUUID();
    const body = song();
    const first = jobResponseSchema.parse(
      await (await post(http, token, body, key)).json(),
    );
    const second = await post(http, token, body, key);
    expect(second.status).toBe(202);
    expect(jobResponseSchema.parse(await second.json()).jobId).toBe(
      first.jobId,
    );
    await settled(token, first.jobId);
    const again = await post(http, token, body, key);
    expect(jobResponseSchema.parse(await again.json()).status).toBe('ready');
    const changed = await post(http, token, song(), key);
    expect(changed.status).toBe(400);
    const rows = await client
      .from('generation_jobs')
      .select('id')
      .eq('user_id', id);
    expect(rows.data).toHaveLength(1);
    expect((await balance(id)).balance).toBe(before.balance - 10);
  }, 30000);

  it('IT-16 a provider timeout fails the job and releases the credits', async () => {
    const { id, token } = await user();
    const before = await balance(id);
    const response = await post(
      http,
      token,
      song({ description: 'A song ⟦mock:fail:timeout⟧' }),
    );
    expect(response.status).toBe(202);
    const started = jobResponseSchema.parse(await response.json());
    const done = await settled(token, started.jobId);
    expect(done).toMatchObject({
      status: 'refunded',
      errorCode: 'PROVIDER_TIMEOUT',
    });
    expect((await songRow(done.songId ?? '')).status).toBe('failed');
    expect(await balance(id)).toEqual(before);
  }, 30000);

  it('IT-19 the per-user concurrency limit refuses a third music job', async () => {
    const { id, token } = await user();
    const first = await post(parked, token, song());
    const second = await post(parked, token, song());
    expect([first.status, second.status]).toEqual([202, 202]);
    const third = await post(parked, token, song());
    expect(third.status).toBe(429);
    expect(errorResponseSchema.parse(await third.json()).error.code).toBe(
      'CONCURRENCY_LIMIT',
    );
    const rows = await client
      .from('generation_jobs')
      .select('id')
      .eq('user_id', id);
    for (const row of rows.data ?? [])
      await client
        .schema('app')
        .rpc('fail_song_job', { p_job_id: row.id, p_error_code: 'INTERNAL' });
    expect((await balance(id)).held).toBe(0);
  }, 30000);

  it('refuses blocked input and ineligible manual models without charging', async () => {
    const { id, token } = await user();
    const before = await balance(id);
    const blocked = await post(
      http,
      token,
      song({ description: 'A song ⟦mock:hate⟧' }),
    );
    expect(blocked.status).toBe(422);
    expect(errorResponseSchema.parse(await blocked.json()).error.code).toBe(
      'MODERATION_BLOCKED',
    );
    const manual = await post(
      http,
      token,
      song({
        language: 'tr',
        modelId: 'mock-music-a',
        sections: [{ tag: '[Verse]', lines: ['Deniz'] }],
      }),
    );
    expect(manual.status).toBe(422);
    const body = errorResponseSchema.parse(await manual.json());
    expect(body.error.code).toBe('MODEL_NOT_ELIGIBLE');
    expect(body.error.details).toEqual({
      perModel: { 'mock-music-a': 'language_unverified' },
    });
    expect(await balance(id)).toEqual(before);
  });
});

describe('T-20 create flow additions', () => {
  it('stores the style controls and sends one style string', async () => {
    const { token } = await user();
    const response = await post(parked, token, {
      ...song({ description: undefined }),
      style: 'with soft strings',
      styleControls: { genre: 'turkish_pop', mood: 'happy', tempo: 'fast' },
    });
    expect(response.status).toBe(202);
    const started = jobResponseSchema.parse(await response.json());
    const row = await client
      .from('generation_jobs')
      .select('steps')
      .eq('id', started.jobId)
      .single();
    expect(row.data?.steps).toMatchObject({
      request: {
        description: '',
        style: 'Turkish pop, happy, fast tempo, with soft strings',
      },
    });
    const stored = await client
      .from('songs')
      .select('style')
      .eq('id', started.songId ?? '')
      .single();
    expect(stored.data?.style).toEqual({
      text: 'with soft strings',
      controls: { genre: 'turkish_pop', mood: 'happy', tempo: 'fast' },
    });
  });
  it('refuses controls the routed model does not support, without charging', async () => {
    const { id, token } = await user();
    const before = await balance(id);
    for (const [styleControls, field] of [
      [{ bpm: 120 }, 'styleControls.bpm'],
      [{ vocalType: 'female' }, 'styleControls.vocalType'],
    ] as const) {
      const response = await post(http, token, song({ styleControls }));
      expect(response.status).toBe(400);
      expect(
        errorResponseSchema.parse(await response.json()).error,
      ).toMatchObject({
        code: 'VALIDATION',
        details: { fields: [field] },
      });
    }
    expect(await balance(id)).toEqual(before);
  });
  it('GET /v1/wallet returns balance, held and available', async () => {
    const { token } = await user();
    const wallet = async () => {
      const response = await fetch(`${http.url}/v1/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      return await response.json();
    };
    expect(await wallet()).toEqual({ balance: 30, held: 0, available: 30 });
    expect((await post(parked, token, song())).status).toBe(202);
    expect(await wallet()).toEqual({ balance: 30, held: 10, available: 20 });
    const anonymous = await fetch(`${http.url}/v1/wallet`);
    expect(anonymous.status).toBe(401);
  });
});
describe('IT-18 fallback at run time (@isolated)', () => {
  const kill = 'kill_switch:provider:mock-music-a';
  async function startParked(token: string) {
    const response = await post(parked, token, song());
    expect(response.status).toBe(202);
    const started = jobResponseSchema.parse(await response.json());
    expect(started.modelId).toBe('mock-music-a');
    return started;
  }
  async function run(jobId: string) {
    const queue = queues.queues.get('music:mock-music-a');
    if (!queue) throw new Error('queue missing');
    await enqueue(
      queue,
      'generate',
      { jobId, correlationId: randomUUID() },
      { jobId },
    );
  }

  it('Auto falls back to a model priced at most the reservation', async () => {
    const { id, token } = await user();
    const before = await balance(id);
    const started = await startParked(token);
    try {
      await setFlag(kill, true);
      refresh();
      await run(started.jobId);
      const done = await settled(token, started.jobId);
      expect(done).toMatchObject({ status: 'ready', modelId: 'mock-music-b' });
      expect(done.routeReason).toEqual({
        kind: 'auto',
        fallbackFrom: 'mock-music-a',
      });
      expect((await balance(id)).balance).toBe(before.balance - 10);
    } finally {
      await clearFlag(kill);
      refresh();
    }
  }, 30000);

  it('never falls back to a more expensive model', async () => {
    const { id, token } = await user();
    const before = await balance(id);
    const started = await startParked(token);
    try {
      await setFlag(kill, true);
      const price = await client
        .from('model_prices')
        .update({ credits: 11 })
        .eq('model_id', 'mock-music-b')
        .eq('operation', 'generate');
      expect(price.error).toBeNull();
      refresh();
      await run(started.jobId);
      const done = await settled(token, started.jobId);
      expect(done).toMatchObject({
        status: 'refunded',
        errorCode: 'NO_ELIGIBLE_MODEL',
      });
      expect(await balance(id)).toEqual(before);
    } finally {
      await client
        .from('model_prices')
        .update({ credits: 10 })
        .eq('model_id', 'mock-music-b')
        .eq('operation', 'generate');
      await clearFlag(kill);
      refresh();
    }
  }, 30000);
});
