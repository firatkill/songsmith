import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { generateKeyPair, SignJWT } from 'jose';
import {
  consentVersions,
  meResponseSchema,
  profileSchema,
  consentsResponseSchema,
  type Database,
} from '@songsmith/schemas';
import { formatMessage } from '@songsmith/i18n';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/lib/env.js';
import { createLogger } from '../../src/lib/log.js';
import { requireConsent } from '../../src/lib/auth.js';
import { defineRoute } from '../../src/lib/route.js';
import { serve } from '../http.js';
const status = z
  .object({
    API_URL: z.url(),
    ANON_KEY: z.string(),
    SERVICE_ROLE_KEY: z.string(),
    MAILPIT_URL: z.url(),
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
const users = new Set<string>();
const hashes = new Set<string>();
let http: Awaited<ReturnType<typeof serve>>;
const logs: string[] = [];
beforeAll(async () => {
  http = await serve(
    createApp({
      env: loadEnv({
        APP_ENV: 'ci',
        SUPABASE_URL: status.API_URL,
        SUPABASE_ANON_KEY: status.ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      }),
      logger: createLogger('info', {
        write: (line) => {
          logs.push(line);
        },
      }),
      registerRoutes: (context) => {
        defineRoute(context, {
          method: 'get',
          path: '/consent-probe',
          auth: 'required',
          request: { params: z.object({}), query: z.object({}) },
          response: { 200: z.object({ ok: z.boolean() }) },
          handler: async () => {
            await requireConsent('ai_disclosure')(() => client);
            return { status: 200, body: { ok: true } };
          },
        });
        defineRoute(context, {
          method: 'get',
          path: '/optional-probe',
          auth: 'optional',
          request: { params: z.object({}), query: z.object({}) },
          response: { 200: z.object({ ok: z.boolean() }) },
          handler: () => ({ status: 200, body: { ok: true } }),
        });
      },
    }),
  );
});
afterAll(async () => {
  try {
    for (const id of users) {
      const { error } = await client.auth.admin.deleteUser(id);
      if (error && error.status !== 404) throw error;
    }
  } finally {
    for (const hash of hashes)
      await client
        .schema('app')
        .from('signup_blocks')
        .delete()
        .eq('email_hash', hash);
    await http.close();
  }
});
async function user() {
  const email = `it+${randomUUID()}@example.test`,
    password = randomUUID();
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { locale: 'tr' },
  });
  if (error) throw error;
  users.add(data.user.id);
  const auth = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await auth.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, email, token: signed.data.session.access_token };
}
async function request(
  path: string,
  token?: string,
  method = 'GET',
  body?: unknown,
) {
  return fetch(`${http.url}/v1${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function errorCode(response: Response, code: string, statusCode: number) {
  expect(response.status).toBe(statusCode);
  expect(await response.json()).toMatchObject({ error: { code } });
}
async function adult(token: string) {
  const r = await request('/me/age', token, 'POST', {
    dateOfBirth: '1991-06-17',
  });
  expect(r.status).toBe(200);
  return profileSchema.parse(await r.json());
}
it('IT-04 enforces auth modes and age gate, then permits profile and consent writes', async () => {
  await errorCode(await request('/me'), 'UNAUTHENTICATED', 401);
  await errorCode(await request('/me', 'garbage'), 'UNAUTHENTICATED', 401);
  const keys = await generateKeyPair('ES256');
  const expired = await new SignJWT({
    sub: randomUUID(),
    role: 'authenticated',
  })
    .setIssuer(`${status.API_URL}/auth/v1`)
    .setAudience('authenticated')
    .setExpirationTime(1)
    .setProtectedHeader({ alg: 'ES256' })
    .sign(keys.privateKey);
  await errorCode(await request('/me', expired), 'UNAUTHENTICATED', 401);
  expect((await request('/optional-probe')).status).toBe(200);
  await errorCode(
    await request('/optional-probe', 'bad'),
    'UNAUTHENTICATED',
    401,
  );
  const u = await user();
  const me = meResponseSchema.parse(
    await (await request('/me', u.token)).json(),
  );
  expect(me.needsAgeGate).toBe(true);
  expect(me.profile.handle).toMatch(/^user_[a-f0-9]{12}$/);
  expect(me.profile.locale).toBe('tr');
  expect(me.missingConsents).toEqual(['terms', 'privacy', 'ai_disclosure']);
  await errorCode(
    await request('/me', u.token, 'PATCH', { locale: 'en' }),
    'NOT_ADULT',
    403,
  );
  const consent = {
    kind: 'terms',
    version: consentVersions.terms,
    granted: true,
    source: 'web',
  };
  await errorCode(
    await request('/me/consents', u.token, 'POST', consent),
    'NOT_ADULT',
    403,
  );
  await errorCode(await request('/optional-probe', u.token), 'NOT_ADULT', 403);
  expect((await request('/health', u.token)).status).toBe(200);
  await adult(u.token);
  expect(
    (await request('/me', u.token, 'PATCH', { locale: 'en' })).status,
  ).toBe(200);
  expect((await request('/me/consents', u.token, 'POST', consent)).status).toBe(
    200,
  );
  expect(
    logs.some((line) => {
      const entry: unknown = JSON.parse(line);
      return (
        z.object({ userId: z.string().nullable() }).parse(entry).userId === u.id
      );
    }),
  ).toBe(true);
});
it('IT-05 verifies adult once without persisting or logging date of birth', async () => {
  const u = await user();
  const profile = await adult(u.token);
  expect(profile.is_adult).toBe(true);
  expect(profile.adult_verified_at).not.toBeNull();
  await errorCode(
    await request('/me/age', u.token, 'POST', { dateOfBirth: '1991-06-17' }),
    'CONFLICT',
    409,
  );
  // Search row JSON across every table in public/app, not just profile columns.
  const sql = `do $$ declare t record; found boolean; begin for t in select schemaname, tablename from pg_tables where schemaname in ('public','app') loop execute format('select exists (select 1 from %I.%I r where row_to_json(r)::text like %L)', t.schemaname, t.tablename, '%1991-06-17%') into found; if found then raise exception 'DOB persisted'; end if; end loop; end $$;`;
  expect(() =>
    execFileSync(
      'docker',
      [
        'exec',
        'supabase_db_songsmith',
        'psql',
        '-U',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        sql,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  ).not.toThrow();
  expect(logs.join('')).not.toContain('1991-06-17');
});
it('IT-05 underage deletes identity and hook refuses the same email', async () => {
  const u = await user();
  const birth = `${String(new Date().getUTCFullYear() - 10)}-01-01`;
  await errorCode(
    await request('/me/age', u.token, 'POST', { dateOfBirth: birth }),
    'NOT_ADULT',
    403,
  );
  const hash = createHash('sha256')
    .update(u.email.trim().toLowerCase())
    .digest('hex');
  hashes.add(hash);
  const gone = await client.auth.admin.getUserById(u.id);
  expect(gone.error?.status).toBe(404);
  users.delete(u.id);
  expect(
    (await client.from('profiles').select('id').eq('id', u.id)).data,
  ).toEqual([]);
  const blocked = await client
    .schema('app')
    .from('signup_blocks')
    .select('*')
    .eq('email_hash', hash)
    .single();
  expect(blocked.error).toBeNull();
  expect(blocked.data?.email_hash).toBe(hash);
  expect(JSON.stringify(blocked.data)).not.toContain(u.email);
  expect(
    Date.parse(blocked.data?.blocked_until ?? '') - Date.now(),
  ).toBeGreaterThan(29 * 86400_000);
  const auth = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const again = await auth.auth.signUp({
    email: u.email,
    password: randomUUID(),
  });
  if (again.data.user) users.add(again.data.user.id);
  expect(again.error?.message).toContain(
    formatMessage('en', 'auth.signupUnavailable'),
  );
  expect(again.data.user).toBeNull();
  // The still-signed JWT belongs to a deleted auth identity, not a provisioning bug.
  const logOffset = logs.length;
  await errorCode(await request('/me', u.token), 'UNAUTHENTICATED', 401);
  expect(
    logs
      .slice(logOffset)
      .some(
        (line) =>
          z.object({ level: z.literal('error') }).safeParse(JSON.parse(line))
            .success,
      ),
  ).toBe(false);
  expect(logs.join('')).not.toContain(birth);
});
it('IT-06 appends current consent and mirrors marketing/analytics flags', async () => {
  const u = await user();
  await adult(u.token);
  for (const kind of ['marketing', 'analytics'] as const) {
    for (const granted of [true, false]) {
      const r = await request('/me/consents', u.token, 'POST', {
        kind,
        version: consentVersions[kind],
        granted,
        source: 'ios',
      });
      expect(r.status).toBe(200);
      expect(
        consentsResponseSchema
          .parse(await r.json())
          .consents.find((c) => c.kind === kind),
      ).toMatchObject({
        granted,
        source: 'ios',
        isCurrent: true,
        version: consentVersions[kind],
      });
      const settings = (
        await client
          .from('user_settings')
          .select('*')
          .eq('user_id', u.id)
          .single()
      ).data;
      expect(
        settings?.[
          kind === 'marketing' ? 'marketing_email_opt_in' : 'analytics_consent'
        ],
      ).toBe(granted);
    }
  }
  await errorCode(
    await request('/me/consents', u.token, 'POST', {
      kind: 'terms',
      version: 'stale',
      granted: true,
      source: 'web',
    }),
    'VALIDATION',
    400,
  );
  expect(
    (await client.from('consents').select('*').eq('user_id', u.id)).data,
  ).toHaveLength(4);
  const update = await client
    .from('consents')
    .update({ granted: true })
    .eq('user_id', u.id);
  expect(update.error?.code).toBe('42501');
});
it('handles banned/deleted, cooldown/suspended, reserved handles and case-insensitive conflicts', async () => {
  const u = await user();
  const other = await user();
  await adult(u.token);
  const handle = `test_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  expect(
    (
      await client
        .from('profiles')
        .update({ handle: handle.toUpperCase() })
        .eq('id', other.id)
    ).error,
  ).toBeNull();
  await errorCode(
    await request('/me', u.token, 'PATCH', { handle }),
    'CONFLICT',
    409,
  );
  await errorCode(
    await request('/me', u.token, 'PATCH', { handle: 'admin' }),
    'VALIDATION',
    400,
  );
  await errorCode(
    await request('/me', u.token, 'PATCH', { handle: 'user_abcdef123456' }),
    'VALIDATION',
    400,
  );
  await errorCode(
    await request('/me', u.token, 'PATCH', { bio: 'text' }),
    'VALIDATION',
    400,
  );
  for (const state of ['cooldown', 'suspended', 'banned', 'deleted']) {
    expect(
      (await client.from('profiles').update({ status: state }).eq('id', u.id))
        .error,
    ).toBeNull();
    const r = await request('/me', u.token);
    if (state === 'banned') await errorCode(r, 'FORBIDDEN', 403);
    else if (state === 'deleted') await errorCode(r, 'UNAUTHENTICATED', 401);
    else expect(r.status).toBe(200);
  }
});
it('OTP sign-in through Mailpit issues a JWT accepted by GET /v1/me', async () => {
  const email = `it+${randomUUID()}@example.test`;
  const auth = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const requested = await auth.auth.signInWithOtp({ email });
  expect(requested.error).toBeNull();
  let otp: string | undefined;
  try {
    await expect
      .poll(
        async () => {
          const response = await fetch(
            `${status.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          );
          const inbox = z
            .object({ messages: z.array(z.object({ Subject: z.string() })) })
            .parse(await response.json());
          otp = inbox.messages[0]?.Subject.match(/\b\d{6}\b/)?.[0];
          return otp;
        },
        { timeout: 10000, interval: 200 },
      )
      .toBeTruthy();
    if (!otp) throw new Error('OTP missing');
    const verified = await auth.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });
    if (verified.error) throw verified.error;
    if (!verified.data.user || !verified.data.session)
      throw new Error('No session');
    users.add(verified.data.user.id);
    const r = await request('/me', verified.data.session.access_token);
    expect(r.status).toBe(200);
    expect(meResponseSchema.parse(await r.json()).profile.id).toBe(
      verified.data.user.id,
    );
  } finally {
    // Also clean up an unverified user if Mailpit or verification fails.
    const listed = await client.auth.admin.listUsers({ perPage: 1000 });
    const created = listed.data.users.find((u) => u.email === email);
    if (created) users.add(created.id);
  }
}, 15000);

it('missing profile for a valid JWT returns INTERNAL and logs the provisioning error', async () => {
  const u = await user();
  expect(
    (await client.from('profiles').delete().eq('id', u.id)).error,
  ).toBeNull();
  expect((await client.auth.admin.getUserById(u.id)).data.user?.id).toBe(u.id);
  const offset = logs.length;
  await errorCode(await request('/me', u.token), 'INTERNAL', 500);
  const errorLog = z.object({
    level: z.literal('error'),
    errorCode: z.literal('INTERNAL'),
    userId: z.literal(u.id),
  });
  expect(
    logs
      .slice(offset)
      .some((line) => errorLog.safeParse(JSON.parse(line)).success),
  ).toBe(true);
  expect(logs.slice(offset).join('')).not.toContain(u.email);
  expect(logs.slice(offset).join('')).not.toContain(u.token);
});
it('requireConsent exposes CONSENT_REQUIRED with kind and localized message', async () => {
  const u = await user();
  await adult(u.token);
  for (const locale of ['en', 'tr'] as const) {
    const response = await fetch(`${http.url}/v1/consent-probe`, {
      headers: {
        Authorization: `Bearer ${u.token}`,
        'Accept-Language': locale,
      },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: 'CONSENT_REQUIRED',
        details: { kind: 'ai_disclosure' },
        message: formatMessage(locale, 'errors.CONSENT_REQUIRED'),
      },
    });
  }
  expect(
    (
      await request('/me/consents', u.token, 'POST', {
        kind: 'ai_disclosure',
        version: consentVersions.ai_disclosure,
        granted: true,
        source: 'web',
      })
    ).status,
  ).toBe(200);
  expect((await request('/consent-probe', u.token)).status).toBe(200);
});
