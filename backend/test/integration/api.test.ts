import { beforeAll, afterAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/lib/env.js';
import { createLogger } from '../../src/lib/log.js';
import { serve, testSource } from '../http.js';
let http: Awaited<ReturnType<typeof serve>>;
beforeAll(async () => {
  http = await serve(
    createApp({
      env: loadEnv({ ...testSource, APP_ENV: 'ci' }),
      logger: createLogger('silent'),
      registerWebhooks: (router) => {
        router.post('/probe', (req, res) => {
          const body: unknown = req.body;
          res.json({
            buffer: Buffer.isBuffer(body),
            hex: Buffer.isBuffer(body) ? body.toString('hex') : null,
          });
        });
      },
    }),
  );
});
afterAll(async () => {
  await http.close();
});
it('health is public, has expected body and security headers', async () => {
  const r = await fetch(`${http.url}/v1/health`);
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({
    status: 'ok',
    version: '0.0.0',
    env: 'ci',
    providerMode: 'mock',
  });
  expect(r.headers.get('x-powered-by')).toBeNull();
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  expect(r.headers.get('content-security-policy')).toBeTruthy();
  expect(r.headers.get('strict-transport-security')).toBeTruthy();
});
it('unknown route returns NOT_FOUND', async () => {
  const r = await fetch(`${http.url}/v1/missing`);
  expect(r.status).toBe(404);
  expect(await r.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
});
it('malformed JSON returns VALIDATION with correlation and security headers', async () => {
  const r = await fetch(`${http.url}/v1/missing`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-correlation-id': 'parse-error',
    },
    body: '{invalid',
  });
  expect(r.status).toBe(400);
  expect(await r.json()).toMatchObject({ error: { code: 'VALIDATION' } });
  expect(r.headers.get('x-correlation-id')).toBe('parse-error');
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
});
it('oversized JSON returns PAYLOAD_TOO_LARGE', async () => {
  const r = await fetch(`${http.url}/v1/missing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'a'.repeat(256 * 1024) }),
  });
  expect(r.status).toBe(413);
  expect(await r.json()).toMatchObject({
    error: { code: 'PAYLOAD_TOO_LARGE' },
  });
});
it.each(['{ "not": "normalized" }\n', '{malformed', '\u0000\u00ffbytes'])(
  'webhooks preserve exact raw bytes: %j',
  async (data) => {
    const body = Buffer.from(data);
    const r = await fetch(`${http.url}/v1/webhooks/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ buffer: true, hex: body.toString('hex') });
  },
);
it('echoes correlation ID', async () => {
  const r = await fetch(`${http.url}/v1/health`, {
    headers: { 'x-correlation-id': 'integration-123' },
  });
  expect(r.headers.get('x-correlation-id')).toBe('integration-123');
});
it('PostgREST exposes app to service role but refuses anon', async (ctx) => {
  let url = process.env['SUPABASE_URL'];
  let anon = process.env['SUPABASE_ANON_KEY'];
  let service = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !anon || !service) {
    let status: string;
    try {
      status = execFileSync(
        'pnpm',
        ['exec', 'supabase', 'status', '-o', 'env'],
        {
          cwd: new URL('../../..', import.meta.url),
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch (error) {
      if (process.env['CI'] || process.env['APP_ENV'] === 'ci')
        throw new Error('Local Supabase is required in CI', { cause: error });
      const stderr =
        error && typeof error === 'object' && 'stderr' in error
          ? String(error.stderr)
          : '';
      if (
        !/not running|No such container|failed to inspect container|Cannot connect to.*Docker|Is the docker daemon running/i.test(
          stderr,
        )
      )
        throw new Error('Could not inspect local Supabase status', {
          cause: error,
        });
      ctx.skip('Local Supabase is not running; run pnpm db:start');
      return;
    }

    const values = Object.fromEntries(
      status.split('\n').flatMap((line) => {
        const match = /^([A-Z_]+)="(.*)"$/.exec(line);
        return match?.[1] ? [[match[1], match[2]]] : [];
      }),
    );
    url ??= values['API_URL'];
    anon ??= values['ANON_KEY'];
    service ??= values['SERVICE_ROLE_KEY'];
  }
  if (!url || !anon || !service)
    throw new Error('Local Supabase URL/keys missing');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
    throw new Error('Integration tests require local Supabase');
  const endpoint = `${url}/rest/v1/flags?select=key&limit=1`;
  const allowed = await fetch(endpoint, {
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Accept-Profile': 'app',
    },
  });
  expect(allowed.status).toBe(200);
  const denied = await fetch(endpoint, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Accept-Profile': 'app',
    },
  });
  expect([401, 403]).toContain(denied.status);
  expect(await denied.json()).toMatchObject({ code: '42501' });
});
