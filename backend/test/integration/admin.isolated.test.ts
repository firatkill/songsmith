// IT-31 (SEC-10). Isolated: it changes the shared catalogue and flags and
// restores both in `finally`.
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { catalogueSchema, type Database } from '@songsmith/schemas';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/lib/env.js';
import { createLogger } from '../../src/lib/log.js';
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

function totp(secret: string) {
  const bits = (secret.toUpperCase().match(/[A-Z2-7]/g) ?? [])
    .map((c) =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
        .indexOf(c)
        .toString(2)
        .padStart(5, '0'),
    )
    .join('');
  const bytes = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', bytes).update(counter).digest();
  const offset = (hash.at(-1) ?? 0) & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, '0');
}

const flagKey = 'kill_switch:operation:stems';

it('IT-31: admin API requires staff and AAL2, and audits every change', async () => {
  const app = createApp({
    env: loadEnv({
      APP_ENV: 'ci',
      SUPABASE_URL: status.API_URL,
      SUPABASE_ANON_KEY: status.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      MOCK_LATENCY_MS: '0',
    }),
    logger: createLogger('silent'),
  });
  const http = await serve(app);
  const auth = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const flagBefore = await client
    .schema('app')
    .from('flags')
    .select('value')
    .eq('key', flagKey)
    .maybeSingle();
  if (flagBefore.error) throw flagBefore.error;
  let userId: string | undefined;
  try {
    const email = `admin-it+${randomUUID()}@example.test`;
    const password = randomUUID();
    const user = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (user.error) throw user.error;
    userId = user.data.user.id;
    const adult = await client
      .from('profiles')
      .update({ is_adult: true, adult_verified_at: new Date().toISOString() })
      .eq('id', userId);
    if (adult.error) throw adult.error;
    const signed = await auth.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    const aal1 = signed.data.session.access_token;
    const call = (
      path: string,
      token?: string,
      init: { method?: string; body?: unknown } = {},
    ) =>
      fetch(`${http.url}/v1/admin${path}`, {
        method: init.method ?? 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.body === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });

    expect((await call('/catalogue')).status).toBe(401);
    expect((await call('/catalogue', aal1)).status).toBe(403);
    const staff = await client
      .schema('app')
      .from('staff_roles')
      .insert({ user_id: userId, role: 'admin' });
    if (staff.error) throw staff.error;
    // Staff without MFA is still refused.
    expect((await call('/catalogue', aal1)).status).toBe(403);
    const enrolled = await auth.auth.mfa.enroll({ factorType: 'totp' });
    if (enrolled.error) throw enrolled.error;
    const verified = await auth.auth.mfa.challengeAndVerify({
      factorId: enrolled.data.id,
      code: totp(enrolled.data.totp.secret),
    });
    if (verified.error) throw verified.error;
    const aal2 = verified.data.access_token;

    const whoami = await call('/whoami', aal2);
    expect(whoami.status).toBe(200);
    expect(await whoami.json()).toEqual({ userId, roles: ['admin'] });

    const catalogue = await call('/catalogue', aal2);
    expect(catalogue.status).toBe(200);
    const models = z
      .object({
        models: z.array(z.object({ id: z.string(), usable: z.boolean() })),
      })
      .parse(await catalogue.json()).models;
    expect(models.find((model) => model.id === 'mock-music-b')?.usable).toBe(
      true,
    );

    const publicIds = async () => {
      const response = await fetch(`${http.url}/v1/catalogue`);
      expect(response.status).toBe(200);
      return catalogueSchema
        .parse(await response.json())
        .models.map((model) => model.id);
    };
    expect(await publicIds()).toContain('mock-music-b');
    const disabled = await call('/catalogue/mock-music-b', aal2, {
      method: 'PATCH',
      body: { enabled: false },
    });
    expect(disabled.status).toBe(200);
    expect(await disabled.json()).toMatchObject({
      id: 'mock-music-b',
      enabled: false,
      usable: false,
    });
    expect(await publicIds()).not.toContain('mock-music-b');
    expect(
      (
        await call('/catalogue/mock-music-b', aal2, {
          method: 'PATCH',
          body: {},
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('/catalogue/missing-model', aal2, {
          method: 'PATCH',
          body: { enabled: true },
        })
      ).status,
    ).toBe(404);

    const set = await call(`/flags/${encodeURIComponent(flagKey)}`, aal2, {
      method: 'PUT',
      body: { value: true },
    });
    expect(set.status).toBe(200);
    expect(await set.json()).toMatchObject({ key: flagKey, value: true });
    expect(
      (
        await call(`/flags/${encodeURIComponent(flagKey)}`, aal2, {
          method: 'PUT',
          body: { value: 'yes' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('/flags/not_a_flag', aal2, {
          method: 'PUT',
          body: { value: true },
        })
      ).status,
    ).toBe(404);

    const audit = await client
      .schema('app')
      .from('audit_log')
      .select('action,target,diff')
      .eq('actor_id', userId)
      .order('at');
    if (audit.error) throw audit.error;
    expect(audit.data).toEqual([
      {
        action: 'catalogue.update',
        target: 'models/mock-music-b',
        diff: {
          before: { enabled: true, qualityRank: 10 },
          after: { enabled: false, qualityRank: 10 },
        },
      },
      {
        action: 'flags.update',
        target: `flags/${flagKey}`,
        diff: { before: false, after: true },
      },
    ]);

    // Restore via the API and prove the same server's warmed cache updates.
    const restored = await call('/catalogue/mock-music-b', aal2, {
      method: 'PATCH',
      body: { enabled: true },
    });
    expect(restored.status).toBe(200);
    expect(await publicIds()).toContain('mock-music-b');

    // Removing the role revokes access even with AAL2.
    await client
      .schema('app')
      .from('staff_roles')
      .delete()
      .eq('user_id', userId);
    expect((await call('/catalogue', aal2)).status).toBe(403);
  } finally {
    await client
      .from('models')
      .update({ enabled: true })
      .eq('id', 'mock-music-b');
    if (flagBefore.data)
      await client
        .schema('app')
        .from('flags')
        .update({ value: flagBefore.data.value })
        .eq('key', flagKey);
    else await client.schema('app').from('flags').delete().eq('key', flagKey);
    await http.close();
    await (app.locals['closeQueues'] as () => Promise<void>)();
    if (userId) await client.auth.admin.deleteUser(userId);
  }
}, 30000);
