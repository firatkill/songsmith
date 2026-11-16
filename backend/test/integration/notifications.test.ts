import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  type Database,
  consentVersions,
  jobResponseSchema,
  notificationsResponseSchema,
  settingsSchema,
  notificationPrefsSchema,
} from '@songsmith/schemas';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/lib/env.js';
import { createLogger } from '../../src/lib/log.js';
import { createRegistry } from '../../src/models/registry.js';
import { createFlags } from '../../src/lib/flags.js';
import { createGenerateSong } from '../../src/songs/generate.js';
import {
  createNotify,
  createDeliverNotification,
} from '../../src/notify/index.js';
import { MockPushSender, ExpoPushSender } from '../../src/notify/push.js';
import { SmtpSender } from '../../src/notify/email.js';
import { serve } from '../http.js';
import { recoverNotifications } from '../../src/notify/recovery.js';
import type { JobQueue } from '../../src/jobs/queues.js';
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
        env: { ...process.env, DO_NOT_TRACK: '1' },
      }),
    ),
  );
if (new URL(status.API_URL).hostname !== '127.0.0.1')
  throw new Error('Local Supabase required');
const client = createClient<Database>(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const env = loadEnv({
  APP_ENV: 'ci',
  SUPABASE_URL: status.API_URL,
  SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  MOCK_LATENCY_MS: '1',
});
const service = () => client;
let logs = '';
const logger = createLogger('info', {
  write: (chunk) => {
    logs += chunk;
  },
});
const push = new MockPushSender();
const queued: string[] = [];
const notify = createNotify(service, (id) => {
  queued.push(id);
  return Promise.resolve();
});
const deliver = createDeliverNotification({
  service,
  push,
  email: new SmtpSender(env),
  webUrl: env.PUBLIC_WEB_URL,
  logger,
});
let http: Awaited<ReturnType<typeof serve>>;
let generate: ReturnType<typeof createGenerateSong>;
const users: string[] = [];
beforeAll(async () => {
  const flags = createFlags(service, logger),
    models = await createRegistry(service, env, flags, logger);
  generate = createGenerateSong({
    service,
    models: () => Promise.resolve(models),
    logger,
    notify,
  });
  http = await serve(
    createApp({ env, logger, enqueue: () => Promise.resolve() }),
  );
});
afterAll(async () => {
  await http.close();
  for (const id of users) await client.auth.admin.deleteUser(id);
});
async function user() {
  const email = `e2e+${randomUUID()}@example.test`,
    password = randomUUID();
  const created = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw new Error('User creation failed');
  const id = created.data.user.id;
  users.push(id);
  await client
    .from('profiles')
    .update({ is_adult: true, adult_verified_at: new Date().toISOString() })
    .eq('id', id);
  await client.schema('app').rpc('record_consent', {
    p_user_id: id,
    p_kind: 'ai_disclosure',
    p_version: consentVersions.ai_disclosure,
    p_granted: true,
    p_source: 'web',
  });
  const anon = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error) throw new Error('Sign-in failed');
  return { id, email, token: signed.data.session.access_token };
}
function request(token: string, path: string, method = 'GET', body?: unknown) {
  return fetch(`${http.url}/v1/me${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function song(token: string, fail = false) {
  const response = await fetch(`${http.url}/v1/songs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    },
    body: JSON.stringify({
      title: 'PRIVATE_TITLE_MARKER',
      description: fail ? 'Calm piano ⟦mock:fail:timeout⟧' : 'Calm piano',
      language: 'en',
      instrumental: true,
      durationSec: 30,
    }),
  });
  expect(response.status).toBe(202);
  const job = jobResponseSchema.parse(await response.json());
  const handle = {
    data: { jobId: job.jobId, correlationId: randomUUID() },
    moveToDelayed: () => Promise.resolve(),
    opts: { attempts: 1 },
  };
  if (fail) await expect(generate(handle)).rejects.toThrow();
  else await generate(handle);
  return { job, handle };
}
const mailList = z.object({ messages: z.array(z.object({ ID: z.string() })) });
async function mail(email: string) {
  const response = await fetch(
    `http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
  );
  return mailList.parse(await response.json()).messages;
}
it('IT-20 ready writes one row, opted-in Mailpit email and mock push; retry does not duplicate', async () => {
  const u = await user();
  expect(
    (
      await request(u.token, '/settings', 'PUT', {
        notificationPrefs: { email: { song_ready: true } },
      })
    ).status,
  ).toBe(200);
  const token = `ExpoPushToken[${randomUUID()}]`;
  expect(
    (
      await request(u.token, '/devices', 'POST', {
        platform: 'android',
        expoPushToken: token,
      })
    ).status,
  ).toBe(200);
  const { job, handle } = await song(u.token);
  const rows = notificationsResponseSchema.parse(
    await (await request(u.token, '/notifications')).json(),
  );
  expect(rows.items).toHaveLength(1);
  expect(rows.items[0]?.kind).toBe('song_ready');
  const id = z.uuid().parse(rows.items[0]?.id);
  await deliver(id);
  await generate(handle);
  await deliver(id);
  expect(
    (await client.from('notifications').select('id').eq('user_id', u.id)).data,
  ).toHaveLength(1);
  expect(push.messages.filter((m) => m.to === token)).toHaveLength(1);
  await expect.poll(async () => (await mail(u.email)).length).toBe(1);
  expect(push.messages.find((m) => m.to === token)?.data.jobId).toBe(job.jobId);
  expect(logs).not.toContain('PRIVATE_TITLE_MARKER');
  expect(logs).not.toContain(u.email);
  expect(logs).not.toContain(token);
});
it('IT-20 email opt-out sends no mail and song failure emits song_failed', async () => {
  const u = await user();
  await song(u.token, true);
  const rows = notificationsResponseSchema.parse(
    await (await request(u.token, '/notifications')).json(),
  );
  expect(rows.items[0]?.kind).toBe('song_failed');
  await deliver(z.uuid().parse(rows.items[0]?.id));
  expect(await mail(u.email)).toHaveLength(0);
});
it('settings validate and merge defaults without resetting earlier preferences', async () => {
  const u = await user();
  await request(u.token, '/settings', 'PUT', {
    notificationPrefs: {
      email: { song_ready: true },
      push: { song_failed: false },
    },
    marketingEmailOptIn: true,
  });
  const result = settingsSchema.parse(
    await (
      await request(u.token, '/settings', 'PUT', {
        notificationPrefs: { email: { video_ready: true } },
      })
    ).json(),
  );
  expect(result.notification_prefs.email.song_ready).toBe(true);
  expect(result.notification_prefs.email.video_ready).toBe(true);
  expect(result.notification_prefs.push.song_failed).toBe(false);
  expect(result.marketing_email_opt_in).toBe(true);
  expect(
    (
      await request(u.token, '/settings', 'PUT', {
        notificationPrefs: { email: { topup_receipt: false } },
      })
    ).status,
  ).toBe(400);
});
it('device reassignment and own-only delete', async () => {
  const a = await user(),
    b = await user(),
    token = `ExpoPushToken[${randomUUID()}]`;
  for (const u of [a, b])
    expect(
      (
        await request(u.token, '/devices', 'POST', {
          platform: 'android',
          expoPushToken: token,
        })
      ).status,
    ).toBe(200);
  await request(a.token, `/devices/${encodeURIComponent(token)}`, 'DELETE');
  const row = await client
    .schema('app')
    .from('devices')
    .select('user_id,last_seen_at')
    .eq('expo_push_token', token)
    .single();
  expect(row.data?.user_id).toBe(b.id);
  expect(row.data?.last_seen_at).toBeTruthy();
  await request(b.token, `/devices/${encodeURIComponent(token)}`, 'DELETE');
  expect(
    (
      await client
        .schema('app')
        .from('devices')
        .select('id')
        .eq('expo_push_token', token)
    ).data,
  ).toHaveLength(0);
});
it('pagination, read-all and selected read affect own rows only', async () => {
  const a = await user(),
    b = await user();
  const ids = [];
  for (let i = 0; i < 3; i++)
    ids.push(await notify(a.id, 'song_ready', {}, randomUUID()));
  const foreign = await notify(b.id, 'song_ready', {}, randomUUID());
  const first = notificationsResponseSchema.parse(
    await (await request(a.token, '/notifications?limit=2')).json(),
  );
  expect(first.items).toHaveLength(2);
  expect(first.unread).toBe(3);
  const next = notificationsResponseSchema.parse(
    await (
      await request(
        a.token,
        `/notifications?limit=2&cursor=${encodeURIComponent(z.string().parse(first.nextCursor))}`,
      )
    ).json(),
  );
  expect(next.items).toHaveLength(1);
  expect(new Set([...first.items, ...next.items].map((i) => i.id)).size).toBe(
    3,
  );
  await request(a.token, '/notifications/read', 'POST', {
    ids: [ids[0], foreign],
  });
  expect(
    (
      await client
        .from('notifications')
        .select('read_at')
        .eq('id', foreign)
        .single()
    ).data?.read_at,
  ).toBeNull();
  await request(a.token, '/notifications/read', 'POST', { all: true });
  expect(
    notificationsResponseSchema.parse(
      await (await request(a.token, '/notifications')).json(),
    ).unread,
  ).toBe(0);
});
it('Expo DeviceNotRegistered ticket deletes the device', async () => {
  const u = await user(),
    token = `ExpoPushToken[${randomUUID()}]`;
  await request(u.token, '/devices', 'POST', {
    platform: 'android',
    expoPushToken: token,
  });
  const id = await notify(u.id, 'song_ready', {}, randomUUID());
  const sender = new ExpoPushSender('test', () =>
    Promise.resolve(
      Response.json({
        data: { status: 'error', details: { error: 'DeviceNotRegistered' } },
      }),
    ),
  );
  await createDeliverNotification({
    service,
    push: sender,
    email: new SmtpSender(env),
    webUrl: env.PUBLIC_WEB_URL,
    logger,
  })(id);
  expect(
    (
      await client
        .schema('app')
        .from('devices')
        .select('id')
        .eq('expo_push_token', token)
    ).data,
  ).toHaveLength(0);
});
it('email retry skips an already persisted push channel', async () => {
  const u = await user(),
    token = `ExpoPushToken[${randomUUID()}]`;
  await request(u.token, '/devices', 'POST', {
    platform: 'android',
    expoPushToken: token,
  });
  await request(u.token, '/settings', 'PUT', {
    notificationPrefs: { email: { song_ready: true } },
  });
  const id = await notify(u.id, 'song_ready', {}, randomUUID());
  let attempts = 0;
  const delivery = createDeliverNotification({
    service,
    push,
    email: {
      send: () => {
        attempts++;
        return attempts === 1
          ? Promise.reject(new Error('temporary'))
          : Promise.resolve();
      },
    },
    webUrl: env.PUBLIC_WEB_URL,
    logger,
  });
  await expect(delivery(id)).rejects.toThrow();
  await delivery(id);
  expect(attempts).toBe(2);
  expect(push.messages.filter((m) => m.to === token)).toHaveLength(1);
});
it('notification enqueue failure never fails a completed song', async () => {
  const u = await user();
  const flags = createFlags(service, logger),
    models = await createRegistry(service, env, flags, logger);
  const original = generate;
  try {
    generate = createGenerateSong({
      service,
      models: () => Promise.resolve(models),
      logger,
      notify: () => Promise.reject(new Error('queue offline')),
    });
    const { job } = await song(u.token);
    expect(
      (
        await client
          .from('generation_jobs')
          .select('status')
          .eq('id', job.jobId)
          .single()
      ).data?.status,
    ).toBe('ready');
  } finally {
    generate = original;
  }
});
it('GET me applies defaults', async () => {
  const u = await user();
  const body = z
    .object({ settings: settingsSchema })
    .parse(await (await request(u.token, '')).json());
  expect(body.settings.notification_prefs).toEqual(
    notificationPrefsSchema.parse({}),
  );
});
it('push retry does not resend a device accepted before another device failed', async () => {
  const u = await user();
  for (let i = 0; i < 2; i++)
    await request(u.token, '/devices', 'POST', {
      platform: 'android',
      expoPushToken: `ExpoPushToken[${randomUUID()}]`,
    });
  const id = await notify(u.id, 'song_ready', {}, randomUUID());
  const attempts = new Map<string, number>();
  let fail = true;
  const delivery = createDeliverNotification({
    service,
    push: {
      send: (message) => {
        const count = (attempts.get(message.to) ?? 0) + 1;
        attempts.set(message.to, count);
        if (attempts.size === 2 && fail) {
          fail = false;
          return Promise.reject(new Error('temporary'));
        }
        return Promise.resolve('sent');
      },
    },
    email: new SmtpSender(env),
    webUrl: env.PUBLIC_WEB_URL,
    logger,
  });
  await expect(delivery(id)).rejects.toThrow('Push delivery incomplete');
  await delivery(id);
  expect([...attempts.values()].sort()).toEqual([1, 2]);
});

it('recovery notifies recent finished jobs only, never old ones', async () => {
  const u = await user();
  const recent = await song(u.token);
  const old = await song(u.token);
  // Simulate songs finished before the notify step existed.
  await client
    .from('notifications')
    .delete()
    .in('dedupe_key', [recent.job.jobId, old.job.jobId]);
  const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  await client
    .from('generation_jobs')
    .update({ heartbeat_at: twoDaysAgo })
    .eq('id', old.job.jobId);
  const added: string[] = [];
  const queue = {
    getJob: () => Promise.resolve(undefined),
    add: (_name: string, data: { jobId: string }) => {
      added.push(data.jobId);
      return Promise.resolve({});
    },
  } as unknown as JobQueue;
  await recoverNotifications(service, new Map([['notify', queue]]), logger);
  const rows = await client
    .from('notifications')
    .select('id,dedupe_key')
    .eq('user_id', u.id);
  expect(rows.data?.map((r) => r.dedupe_key)).toEqual([recent.job.jobId]);
  expect(added).toContain(rows.data?.[0]?.id);
});
