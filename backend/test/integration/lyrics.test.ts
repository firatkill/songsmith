// IT-14 and the lyricist endpoints (TRD §11). Each test uses its own user.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  consentVersions,
  errorResponseSchema,
  lyricsRewriteResponseSchema,
  lyricsWriteResponseSchema,
  type Database,
} from '@songsmith/schemas';
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
const logLines: string[] = [];
const logger = createLogger('info', {
  write: (line: string) => {
    logLines.push(line);
  },
});
const users: string[] = [];
let http: Awaited<ReturnType<typeof serve>>;

beforeAll(async () => {
  http = await serve(createApp({ env, logger }));
});
afterAll(async () => {
  await http.close();
  for (const id of users) await client.auth.admin.deleteUser(id);
});

async function user(options: { consent?: boolean } = {}) {
  const email = `lyrics-it+${randomUUID()}@example.test`;
  const password = randomUUID();
  // email_confirm triggers the T-17 sign-up grant.
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
  if (options.consent ?? true) {
    const consent = await client.schema('app').rpc('record_consent', {
      p_user_id: id,
      p_kind: 'ai_disclosure',
      p_version: consentVersions.ai_disclosure,
      p_granted: true,
      p_source: 'web',
    });
    if (consent.error) throw consent.error;
  }
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id, token: signed.data.session.access_token };
}

function post(
  path: 'write' | 'rewrite-section',
  token: string,
  body: unknown,
  key: string | null = randomUUID(),
) {
  return fetch(`${http.url}/v1/lyrics/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: JSON.stringify(body),
  });
}
async function errorCode(response: Response) {
  return errorResponseSchema.parse(await response.json()).error.code;
}
async function account(id: string) {
  const row = await client
    .schema('app')
    .from('credit_accounts')
    .select('balance,held')
    .eq('user_id', id)
    .single();
  if (row.error) throw row.error;
  return row.data;
}
async function ledger(id: string) {
  const rows = await client
    .schema('app')
    .from('credit_ledger')
    .select('kind,amount')
    .eq('user_id', id)
    .order('sequence');
  if (rows.error) throw rows.error;
  return rows.data;
}
async function jobs(id: string) {
  const rows = await client
    .from('generation_jobs')
    .select('operation,status,error_code')
    .eq('user_id', id);
  if (rows.error) throw rows.error;
  return rows.data;
}
const write = (description: string, extra: object = {}) => ({
  language: 'en',
  description: `${description} ${randomUUID()}`,
  ...extra,
});

describe('POST /v1/lyrics/write', () => {
  it('writes lyrics, charges the lyricist price once and replays for free', async () => {
    const { id, token } = await user();
    const before = await account(id);
    const key = randomUUID();
    const body = write('A cheerful birthday song about surfing', {
      occasion: 'birthday',
      giftNames: ['Maya'],
    });
    const first = await post('write', token, body, key);
    expect(first.status).toBe(200);
    const result = lyricsWriteResponseSchema.parse(await first.json());
    expect(JSON.stringify(result.lyrics)).toContain('Maya');
    expect(result.lyrics.language).toBe('en');
    expect(await account(id)).toEqual({
      balance: before.balance - 1,
      held: 0,
    });
    expect((await ledger(id)).filter((e) => e.kind === 'spend')).toEqual([
      { kind: 'spend', amount: -1 },
    ]);
    expect(await jobs(id)).toEqual([
      { operation: 'lyrics', status: 'ready', error_code: null },
    ]);
    const replay = await post('write', token, body, key);
    expect(replay.status).toBe(200);
    expect(lyricsWriteResponseSchema.parse(await replay.json())).toEqual(
      result,
    );
    expect((await account(id)).balance).toBe(before.balance - 1);
    const changed = await post('write', token, write('other'), key);
    expect(changed.status).toBe(400);
    expect(await errorCode(changed)).toBe('VALIDATION');
  });

  it('IT-14 repairs invalid output once, then fails with credits released', async () => {
    const { id, token } = await user();
    const before = await account(id);
    const failed = await post(
      'write',
      token,
      write('a song ⟦mock:lyrics:invalid⟧'),
    );
    expect(failed.status).toBe(502);
    expect(await errorCode(failed)).toBe('LYRICS_INVALID');
    expect(await account(id)).toEqual(before);
    expect(await jobs(id)).toEqual([
      { operation: 'lyrics', status: 'failed', error_code: 'LYRICS_INVALID' },
    ]);
    const repaired = await post(
      'write',
      token,
      write('a song ⟦mock:lyrics:invalid_once⟧'),
    );
    expect(repaired.status).toBe(200);
    expect((await account(id)).balance).toBe(before.balance - 1);
    expect((await ledger(id)).filter((e) => e.kind === 'spend')).toHaveLength(
      1,
    );
  });

  it('refuses blocked input without charging and releases the hold on a timeout', async () => {
    const { id, token } = await user();
    const before = await account(id);
    const blocked = await post('write', token, write('a song ⟦mock:hate⟧'));
    expect(blocked.status).toBe(422);
    expect(await errorCode(blocked)).toBe('MODERATION_BLOCKED');
    expect(await jobs(id)).toEqual([]);
    const timeout = await post(
      'write',
      token,
      write('a song ⟦mock:fail:timeout⟧'),
    );
    expect(timeout.status).toBe(504);
    expect(await errorCode(timeout)).toBe('PROVIDER_TIMEOUT');
    expect(await account(id)).toEqual(before);
    expect(await jobs(id)).toEqual([
      { operation: 'lyrics', status: 'failed', error_code: 'PROVIDER_TIMEOUT' },
    ]);
  });

  it('requires the Idempotency-Key, the AI-disclosure consent and credits', async () => {
    const { token } = await user();
    const missingKey = await post('write', token, write('x'), null);
    expect(missingKey.status).toBe(400);
    const noConsent = await user({ consent: false });
    const consent = await post('write', noConsent.token, write('x'));
    expect(consent.status).toBe(403);
    expect(await errorCode(consent)).toBe('CONSENT_REQUIRED');
    const poor = await user();
    const drained = await client.schema('app').rpc('adjust_credits', {
      p_user_id: poor.id,
      p_amount: -(await account(poor.id)).balance,
      p_actor_id: poor.id,
      p_reason: 'test',
      p_idem_key: randomUUID(),
    });
    expect(drained.error).toBeNull();
    const insufficient = await post('write', poor.token, write('x'));
    expect(insufficient.status).toBe(402);
    expect(await errorCode(insufficient)).toBe('INSUFFICIENT_CREDITS');
  });

  it('refuses restricted accounts', async () => {
    const { id, token } = await user();
    const suspended = await client
      .from('profiles')
      .update({ status: 'suspended' })
      .eq('id', id);
    expect(suspended.error).toBeNull();
    const response = await post('write', token, write('x'));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('ACCOUNT_RESTRICTED');
  });

  it('never logs the description or the lyrics', async () => {
    const { token } = await user();
    const marker = `marker${randomUUID().replaceAll('-', '')}`;
    const response = await post('write', token, write(`${marker} summer song`));
    expect(response.status).toBe(200);
    expect(logLines.join('\n')).toContain('lyricist.completed');
    expect(logLines.join('\n')).not.toContain(marker);
  });
});

describe('POST /v1/lyrics/rewrite-section', () => {
  it('rewrites one section for the rewrite price', async () => {
    const { id, token } = await user();
    const before = await account(id);
    const response = await post('rewrite-section', token, {
      language: 'tr',
      index: 1,
      sections: [
        { tag: '[Verse]', lines: ['Sabahın ışığı sıcak'] },
        { tag: '[Chorus]', lines: ['Hep birlikte söylüyoruz'] },
      ],
      instruction: 'daha neşeli olsun',
    });
    expect(response.status).toBe(200);
    const result = lyricsRewriteResponseSchema.parse(await response.json());
    expect(result.section.tag).toBe('[Chorus]');
    expect((await account(id)).balance).toBe(before.balance - 1);
    expect(await jobs(id)).toEqual([
      { operation: 'rewrite', status: 'ready', error_code: null },
    ]);
  });
  it('validates the section index', async () => {
    const { token } = await user();
    const response = await post('rewrite-section', token, {
      language: 'en',
      index: 3,
      sections: [{ tag: '[Verse]', lines: ['one'] }],
    });
    expect(response.status).toBe(400);
  });
});
