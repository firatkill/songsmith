// IT-11, IT-12, IT-13 (TRD §10). Each test uses its own user, so it is not isolated.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  errorResponseSchema,
  moderationCheckResponseSchema,
  type Database,
} from '@songsmith/schemas';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/lib/env.js';
import { createFlags } from '../../src/lib/flags.js';
import { createLogger, type Logger } from '../../src/lib/log.js';
import { createModeration } from '../../src/moderation/pipeline.js';
import { createRegistry } from '../../src/models/registry.js';
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
const anon = createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const env = loadEnv({
  APP_ENV: 'ci',
  SUPABASE_URL: status.API_URL,
  SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  MOCK_LATENCY_MS: '0',
});
const service = () => client;
const silent = createLogger('silent');
const flags = createFlags(service, silent);
const registry = createRegistry(service, env, flags, silent);
const moderate = createModeration({
  service,
  flags,
  logger: silent,
  models: () => registry,
});
const users: string[] = [];
let http: Awaited<ReturnType<typeof serve>>;

beforeAll(async () => {
  http = await serve(createApp({ env, logger: silent }));
});
afterAll(async () => {
  await http.close();
  for (const id of users) await client.auth.admin.deleteUser(id);
});

async function user(options: { adult?: boolean } = {}) {
  const email = `moderation-it+${randomUUID()}@example.test`;
  const password = randomUUID();
  const created = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const id = created.data.user.id;
  users.push(id);
  if (options.adult ?? true) {
    const adult = await client
      .from('profiles')
      .update({ is_adult: true, adult_verified_at: new Date().toISOString() })
      .eq('id', id);
    if (adult.error) throw adult.error;
  }
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id, token: signed.data.session.access_token };
}

function check(token: string | undefined, body: unknown) {
  return fetch(`${http.url}/v1/moderation/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
const text = (value: string) => ({
  parts: [
    { surface: 'description' as const, text: `${value} ${randomUUID()}` },
  ],
});

async function profile(id: string) {
  const row = await client
    .from('profiles')
    .select('status,cooldown_until')
    .eq('id', id)
    .single();
  if (row.error) throw row.error;
  return row.data;
}
async function decisions(id: string) {
  const rows = await client
    .schema('app')
    .from('moderation_decisions')
    .select('id,action,category,layers')
    .eq('user_id', id);
  if (rows.error) throw rows.error;
  return rows.data;
}
function evidence(decisionId: string) {
  // restricted is not exposed through PostgREST; check through SQL.
  const out = execFileSync(
    'psql',
    [
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      '-tAc',
      `select coalesce(string_agg(coalesce(expires_at::text,'null'),','),'') from restricted.moderation_evidence where decision_id = '${z.uuid().parse(decisionId)}'`,
    ],
    { encoding: 'utf8' },
  );
  return out.trim() === '' ? [] : out.trim().split(',');
}
async function cases(id: string) {
  const rows = await client
    .schema('app')
    .from('moderation_cases')
    .select('kind,priority,status')
    .eq('subject_user_id', id);
  if (rows.error) throw rows.error;
  return rows.data;
}

describe('POST /v1/moderation/check', () => {
  it('requires auth and adulthood and validates limits', async () => {
    expect((await check(undefined, text('hello'))).status).toBe(401);
    const minor = await user({ adult: false });
    const notAdult = await check(minor.token, text('hello'));
    expect(notAdult.status).toBe(403);
    expect(errorResponseSchema.parse(await notAdult.json()).error.code).toBe(
      'NOT_ADULT',
    );
    const adult = await user();
    for (const body of [
      { parts: [] },
      { parts: Array.from({ length: 7 }, () => text('x').parts[0]) },
      { parts: [{ surface: 'description', text: 'x'.repeat(12_001) }] },
      {
        parts: [
          { surface: 'description', text: 'x'.repeat(6_001) },
          { surface: 'lyrics', text: 'x'.repeat(6_000) },
        ],
      },
      { parts: [{ surface: 'output_lyrics', text: 'hello' }] },
    ])
      expect((await check(adult.token, body)).status).toBe(400);
  });

  it('allows, labels explicit and caches by input for the same user', async () => {
    const { id, token } = await user();
    const body = text('a summer song about the sea');
    const first = moderationCheckResponseSchema.parse(
      await (await check(token, body)).json(),
    );
    expect(first).toMatchObject({ action: 'allow', explicit: false });
    const second = moderationCheckResponseSchema.parse(
      await (await check(token, body)).json(),
    );
    expect(second.decisionId).toBe(first.decisionId);
    const explicit = moderationCheckResponseSchema.parse(
      await (await check(token, text('party song ⟦mock:explicit⟧'))).json(),
    );
    expect(explicit).toMatchObject({
      action: 'allow_explicit',
      explicit: true,
    });
    const rows = await decisions(id);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(evidence(row.id)).toEqual([]);
  });

  it('a block returns its category and keeps 90-day evidence', async () => {
    const { id, token } = await user();
    const result = moderationCheckResponseSchema.parse(
      await (await check(token, text('song ⟦mock:hate⟧'))).json(),
    );
    expect(result).toMatchObject({ action: 'block', category: 'hate' });
    const [row] = await decisions(id);
    if (!row) throw new Error('decision missing');
    const expiry = evidence(row.id);
    expect(expiry).toHaveLength(1);
    expect(expiry[0]).not.toBe('null');
    expect((await profile(id)).status).toBe('active');
  });

  it('rate limits per user', async () => {
    const { token } = await user();
    const body = text('cached song');
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++)
      statuses.push((await check(token, body)).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});

describe('IT-11 hard block', () => {
  it.each([
    ['layer 1', 'a seductive song about a 12 year old', 'layer1'],
    ['classifier', 'a song ⟦mock:minor_sexual⟧', 'classifier'],
  ])(
    '%s: decision, held evidence, critical case and suspension',
    async (_name, value, layer) => {
      const { id, token } = await user();
      const response = await check(token, text(value));
      const body = moderationCheckResponseSchema.parse(await response.json());
      expect(body).toEqual({
        decisionId: body.decisionId,
        action: 'hard_block',
        explicit: false,
      });
      const [row] = await decisions(id);
      expect(row).toMatchObject({
        action: 'hard_block',
        category: 'minor_sexual',
      });
      if (!row) throw new Error('decision missing');
      const layers = z.object({ classifier: z.unknown() }).parse(row.layers);
      if (layer === 'layer1') expect(layers.classifier).toBeNull();
      else expect(layers.classifier).not.toBeNull();
      expect(evidence(row.id)).toEqual(['null']);
      expect(await cases(id)).toEqual([
        { kind: 'hard_block', priority: 'critical', status: 'open' },
      ]);
      expect((await profile(id)).status).toBe('suspended');
      const next = await check(token, text('a calm song'));
      expect(next.status).toBe(403);
      expect(errorResponseSchema.parse(await next.json()).error.code).toBe(
        'ACCOUNT_RESTRICTED',
      );
    },
  );

  it('writes nothing when a later step in the transaction fails', async () => {
    const { id } = await user();
    const hash = 'a'.repeat(64);
    const result = await client
      .schema('app')
      .rpc('record_moderation_decision', {
        p_user_id: id,
        p_surface: 'description',
        p_input_sha256: hash,
        p_policy_version: 'v1',
        p_layers: {},
        p_category: 'minor_sexual',
        p_severity: 'critical',
        p_action: 'hard_block',
        p_latency_ms: 0,
        // p_text omitted: the evidence insert after the decision fails.
        p_window_seconds: 86400,
        p_cooldown_threshold: 3,
        p_cooldown_seconds: 3600,
        p_suspend_threshold: 6,
      });
    expect(result.error).not.toBeNull();
    expect(await decisions(id)).toEqual([]);
    expect(await cases(id)).toEqual([]);
    expect((await profile(id)).status).toBe('active');
  });
});

describe('IT-12 friction', () => {
  it('three blocks start a cooldown that lapses; six suspend with a flag case', async () => {
    const { id, token } = await user();
    for (let i = 0; i < 3; i++)
      expect((await check(token, text('song ⟦mock:hate⟧'))).status).toBe(200);
    const cooled = await profile(id);
    expect(cooled.status).toBe('cooldown');
    expect(cooled.cooldown_until).not.toBeNull();
    const restricted = await check(token, text('a calm song'));
    expect(restricted.status).toBe(403);
    const error = errorResponseSchema.parse(await restricted.json()).error;
    expect(error.code).toBe('ACCOUNT_RESTRICTED');
    expect(
      z
        .object({ until: z.iso.datetime({ offset: true }) })
        .safeParse(error.details).success,
    ).toBe(true);

    const past = await client
      .from('profiles')
      .update({ cooldown_until: new Date(Date.now() - 1000).toISOString() })
      .eq('id', id);
    if (past.error) throw past.error;
    expect((await check(token, text('a calm song'))).status).toBe(200);
    expect((await profile(id)).status).toBe('active');

    for (let i = 0; i < 3; i++)
      await moderate({ userId: id, parts: text('song ⟦mock:spam⟧').parts });
    expect((await profile(id)).status).toBe('suspended');
    expect(await cases(id)).toEqual([
      { kind: 'flag', priority: 'high', status: 'open' },
    ]);
  });

  it('counts parallel blocks exactly once each', async () => {
    const { id } = await user();
    await Promise.all(
      Array.from({ length: 6 }, () =>
        moderate({ userId: id, parts: text('song ⟦mock:harassment⟧').parts }),
      ),
    );
    expect((await profile(id)).status).toBe('suspended');
    expect(await cases(id)).toEqual([
      { kind: 'flag', priority: 'high', status: 'open' },
    ]);
  });

  it('classifier errors do not count', async () => {
    const { id } = await user();
    for (let i = 0; i < 4; i++)
      await moderate({
        userId: id,
        parts: text('song ⟦mock:fail:invalid_json⟧').parts,
      });
    expect((await profile(id)).status).toBe('active');
  });
});

describe('IT-13 classifier failure fails closed', () => {
  it('retries once, then blocks with classifier_error and stores no evidence', async () => {
    const { id } = await user();
    const real = await registry;
    const spies: Array<{ mock: { calls: unknown[] } }> = [];
    const counting = createModeration({
      service,
      flags,
      logger: silent,
      models: () =>
        Promise.resolve({
          usableModels: (operation?: string) => real.usableModels(operation),
          adapter: (adapterId: string) => {
            const adapter = real.adapter(adapterId);
            if (adapter && 'completeJson' in adapter)
              spies.push(vi.spyOn(adapter, 'completeJson'));
            return adapter;
          },
        }),
    });
    const result = await counting({
      userId: id,
      parts: text('song ⟦mock:fail:invalid_json⟧').parts,
    });
    expect(result).toMatchObject({
      action: 'block',
      category: 'classifier_error',
    });
    expect(spies.reduce((n, spy) => n + spy.mock.calls.length, 0)).toBe(2);
    expect(evidence(result.decisionId)).toEqual([]);
  });
});

it('logs never contain user text (SEC-11)', async () => {
  const { id } = await user();
  const marker = `marker-${randomUUID()}`;
  const lines: string[] = [];
  const capture: Pick<Logger, 'info'> = {
    info: (...args: unknown[]) => {
      lines.push(JSON.stringify(args));
    },
  };
  const logged = createModeration({
    service,
    flags,
    logger: capture,
    models: () => registry,
  });
  await logged({ userId: id, parts: [{ surface: 'lyrics', text: marker }] });
  await logged({
    userId: id,
    parts: [{ surface: 'lyrics', text: `${marker} ⟦mock:minor_sexual⟧` }],
  });
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.join('\n')).not.toContain(marker);
});
