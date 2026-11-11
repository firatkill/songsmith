import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  errorResponseSchema,
  publicFlagsSchema,
  type Database,
  type Json,
} from '@songsmith/schemas';
import { createApp } from '../../src/app.js';
import { createFlags } from '../../src/lib/flags.js';
import { createCosts } from '../../src/lib/costs.js';
import { loadEnv } from '../../src/lib/env.js';
import { createLogger } from '../../src/lib/log.js';
import { defineRoute } from '../../src/lib/route.js';
import { queueDefinitions } from '../../src/jobs/queues.js';
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
const client = createClient<Database>(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const service = () => client;
const env = loadEnv({
  APP_ENV: 'ci',
  SUPABASE_URL: status.API_URL,
  SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
});
const logger = createLogger('silent');
async function setFlag(key: string, value: NonNullable<Json>) {
  const result = await client
    .schema('app')
    .from('flags')
    .upsert({ key, value }, { onConflict: 'key' });
  if (result.error) throw result.error;
}
async function withFlag(
  key: string,
  value: NonNullable<Json>,
  run: () => Promise<void>,
) {
  const original = await client
    .schema('app')
    .from('flags')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (original.error) throw original.error;
  try {
    await setFlag(key, value);
    await run();
  } finally {
    if (original.data) await setFlag(key, original.data.value);
    else {
      const result = await client
        .schema('app')
        .from('flags')
        .delete()
        .eq('key', key);
      expect(result.error).toBeNull();
    }
  }
}
it('IT-09 @isolated API and worker caches observe a kill switch at expiry, within 60 seconds', async () => {
  await withFlag('kill_switch:operation:generate', false, async () => {
    let now = 0;
    const apiFlags = createFlags(service, logger, () => now);
    const workerFlags = createFlags(service, logger, () => now);
    // Same independent service used by worker.ts and its queue configuration.
    await queueDefinitions(service, workerFlags);
    const http = await serve(
      createApp({
        env,
        logger,
        flags: apiFlags,
        registerRoutes: (context) => {
          defineRoute(context, {
            method: 'get',
            path: '/kill-switch-probe',
            auth: 'public',
            request: { params: z.object({}), query: z.object({}) },
            response: { 200: z.object({ off: z.boolean() }) },
            handler: async () => ({
              status: 200,
              body: {
                off: await apiFlags.killSwitch({ operation: 'generate' }),
              },
            }),
          });
        },
      }),
    );
    const api = async () =>
      z
        .object({ off: z.boolean() })
        .parse(await (await fetch(`${http.url}/v1/kill-switch-probe`)).json())
        .off;
    try {
      expect(await api()).toBe(false);
      expect(await workerFlags.killSwitch({ operation: 'generate' })).toBe(
        false,
      );
      await setFlag('kill_switch:operation:generate', true);
      now = 29_999;
      expect(await api()).toBe(false);
      expect(await workerFlags.killSwitch({ operation: 'generate' })).toBe(
        false,
      );
      now = 30_000;
      expect(await api()).toBe(true);
      expect(await workerFlags.killSwitch({ operation: 'generate' })).toBe(
        true,
      );
      const publicResponse = await fetch(`${http.url}/v1/flags/public`);
      expect(publicResponse.headers.get('cache-control')).toBe(
        'public, max-age=30',
      );
      const publicBody: unknown = await publicResponse.json();
      expect(publicBody).toEqual(
        publicFlagsSchema.parse(await apiFlags.getFlags()),
      );
      expect(
        publicFlagsSchema.parse(publicBody)['kill_switch:operation:generate'],
      ).toBe(true);
    } finally {
      await http.close();
    }
  });
});

it('rate limit @isolated fourth PATCH returns catalogue 429 and Retry-After; another user is unaffected', async () => {
  await withFlag(
    'rate_limit:me_patch',
    { max: 3, windowSeconds: 86400 },
    async () => {
      const http = await serve(createApp({ env, logger }));
      const users: string[] = [];
      try {
        const tokens: string[] = [];
        for (let i = 0; i < 2; i++) {
          const email = `e2e+${randomUUID()}@example.test`,
            password = randomUUID();
          const created = await client.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });
          if (created.error) throw created.error;
          users.push(created.data.user.id);
          const updated = await client
            .from('profiles')
            .update({ is_adult: true })
            .eq('id', created.data.user.id);
          if (updated.error) throw updated.error;
          const auth = createClient(status.API_URL, status.ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const signed = await auth.auth.signInWithPassword({
            email,
            password,
          });
          if (signed.error) throw signed.error;
          tokens.push(signed.data.session.access_token);
        }
        const patch = (token: string | undefined) =>
          fetch(`${http.url}/v1/me`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token ?? ''}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ locale: 'en' }),
          });
        for (let i = 0; i < 3; i++)
          expect((await patch(tokens[0])).status).toBe(200);
        const denied = await patch(tokens[0]);
        expect(denied.status).toBe(429);
        expect(Number(denied.headers.get('retry-after'))).toBeGreaterThan(0);
        expect(errorResponseSchema.parse(await denied.json()).error.code).toBe(
          'RATE_LIMITED',
        );
        expect((await patch(tokens[1])).status).toBe(200);
        const rows = await client
          .schema('app')
          .from('rate_limits')
          .select('key')
          .in(
            'key',
            users.map((id) => `me_patch:user:${id}`),
          );
        expect(rows.data).toHaveLength(2);
      } finally {
        for (const id of users) {
          await client
            .schema('app')
            .from('rate_limits')
            .delete()
            .eq('key', `me_patch:user:${id}`);
          await client.auth.admin.deleteUser(id);
        }
        await http.close();
      }
    },
  );
});
it('concurrent fixed-window hits admit exactly max requests', async () => {
  const key = `it09:${randomUUID()}`;
  try {
    const hits = await Promise.all(
      Array.from({ length: 20 }, () =>
        client
          .schema('app')
          .rpc('rate_limit_hit', { key, max: 3, window_seconds: 86400 }),
      ),
    );
    expect(hits.every((hit) => hit.error === null)).toBe(true);
    expect(hits.filter((hit) => hit.data?.[0]?.allowed)).toHaveLength(3);
  } finally {
    await client.schema('app').from('rate_limits').delete().eq('key', key);
  }
});
it('cost wrappers pass registry caps and preserve exact SQL totals without enforcing jobs', async () => {
  const id = randomUUID();
  const costs = createCosts(service, createFlags(service, logger));
  try {
    await Promise.all(
      Array.from({ length: 4 }, () => costs.addCost(`user:${id}`, 100000)),
    );
    const result = await costs.capStatus(id, 'mock-music-a', 0);
    expect(result.user_total).toBe('400000');
    expect(result.exceeded).toContain('user');
  } finally {
    await client
      .schema('app')
      .from('cost_counters')
      .delete()
      .eq('scope', `user:${id}`);
  }
});
