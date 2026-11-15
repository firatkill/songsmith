import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@songsmith/schemas';
import { loadEnv } from '../../src/lib/env.js';
import { createFlags } from '../../src/lib/flags.js';
import { createLogger } from '../../src/lib/log.js';
import { createBreakers } from '../../src/models/breakers.js';
import { createRegistry } from '../../src/models/registry.js';

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
const breakers = createBreakers(service);
// Unique provider ids keep these rows apart from parallel tests and real mocks.
const provider = `it-breaker-${randomUUID().slice(0, 8)}`;

afterAll(async () => {
  await client
    .schema('app')
    .from('provider_health')
    .delete()
    .eq('provider', provider);
});

it('opens after five retryable failures and admits exactly one concurrent probe', async () => {
  for (let i = 0; i < 5; i++)
    await breakers.recordProviderResult(provider, false, 'unavailable');
  const opened = await breakers.states();
  expect(opened.find((row) => row.provider === provider)?.breaker_state).toBe(
    'open',
  );
  // Simulate the 120 s wait, then race twenty workers for the single probe.
  const moved = await client
    .schema('app')
    .from('provider_health')
    .update({ opened_at: new Date(Date.now() - 121_000).toISOString() })
    .eq('provider', provider);
  expect(moved.error).toBeNull();
  const claims = await Promise.all(
    Array.from({ length: 20 }, () => breakers.claimProviderProbe(provider)),
  );
  expect(claims.filter(Boolean)).toHaveLength(1);
  await breakers.recordProviderResult(provider, true);
  const closed = await breakers.states();
  expect(closed.find((row) => row.provider === provider)?.breaker_state).toBe(
    'closed',
  );
});

it('the seeded catalogue matches every mock adapter at startup', async () => {
  const env = loadEnv({
    PROVIDER_MODE: 'mock',
    SUPABASE_URL: status.API_URL,
    SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_JWT_ISSUER: `${status.API_URL}/auth/v1`,
    MOCK_LATENCY_MS: '0',
  });
  const errors: unknown[] = [];
  const logger = createLogger('silent');
  const spy = { ...logger, error: (...args: unknown[]) => errors.push(args) };
  const registry = await createRegistry(
    service,
    env,
    createFlags(service, logger),
    spy as typeof logger,
  );
  const usable = (await registry.usableModels()).map((model) => model.id);
  expect(errors).toEqual([]);
  expect(usable).toEqual(
    expect.arrayContaining([
      'mock-music-a',
      'mock-music-b',
      'mock-text',
      'mock-image',
      'mock-image-safety',
      'mock-align',
    ]),
  );
});
