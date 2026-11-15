import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../lib/env.js';
import { mockFactories } from '../providers/mock/index.js';
import type { MockRuntime } from '../providers/mock/latency.js';
import { capabilities } from '../providers/mock/music.js';
import { createRegistryCache, loadFactories } from './registry.js';

const runtime: MockRuntime = {
  mode: 'mock',
  latencyMs: 0,
  failureRate: 0,
  now: () => 0,
  random: () => 0.5,
  sleep: () => Promise.resolve(),
};
const baseEnv = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_JWT_ISSUER: 'http://127.0.0.1:54321/auth/v1',
};

function row(id: string, overrides: Record<string, unknown> = {}) {
  const music = id.startsWith('mock-music');
  return {
    id,
    adapter: id,
    kind: music ? 'music' : id === 'mock-text' ? 'text' : 'image',
    enabled: true,
    capabilities: music ? capabilities(id === 'mock-music-a' ? 'a' : 'b') : {},
    ...overrides,
  };
}

function setup(
  rows: unknown[],
  health: unknown[] = [],
  killed: (input: { provider?: string; operation?: string }) => boolean = () =>
    false,
) {
  let time = 0;
  const load = vi.fn(() => Promise.resolve(rows));
  const logger = { error: vi.fn() };
  const registry = createRegistryCache({
    factories: mockFactories(runtime),
    flags: { killSwitch: (input) => Promise.resolve(killed(input ?? {})) },
    logger,
    load,
    health: () => Promise.resolve(health),
    now: () => time,
  });
  return {
    registry,
    load,
    logger,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('UT-12: live providers are never imported in mock mode', () => {
  it('mock mode registers only the mock adapters', async () => {
    // providers/live throws on import while PROVIDER_MODE=mock, so loading it would reject.
    vi.stubEnv('PROVIDER_MODE', 'mock');
    const factories = await loadFactories(
      loadEnv({ ...baseEnv, PROVIDER_MODE: 'mock' }),
    );
    expect([...factories.keys()].every((id) => id.startsWith('mock-'))).toBe(
      true,
    );
    expect(factories.size).toBe(6);
  });

  it('the live module refuses to load in mock mode', async () => {
    vi.stubEnv('PROVIDER_MODE', 'mock');
    vi.resetModules();
    await expect(import('../providers/live/index.js')).rejects.toThrow(
      'Live providers imported in mock mode',
    );
  });

  it('live mode loads live adapters and keeps mocks outside production', async () => {
    vi.stubEnv('PROVIDER_MODE', 'live');
    vi.resetModules();
    const { loadFactories: load } = await import('./registry.js');
    const local = await load(
      loadEnv({
        ...baseEnv,
        PROVIDER_MODE: 'live',
        ALLOW_LIVE_PROVIDERS: 'true',
      }),
    );
    expect(local.has('mock-music-a')).toBe(true);
  });
});

describe('registry usable models (TRD §8.2)', () => {
  it('keeps enabled rows whose capabilities match the adapter', async () => {
    const { registry, logger } = setup([
      row('mock-music-a'),
      row('mock-music-b'),
      row('mock-text'),
    ]);
    expect((await registry.usableModels()).map((model) => model.id)).toEqual([
      'mock-music-a',
      'mock-music-b',
      'mock-text',
    ]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('disables a model whose capabilities differ and logs only the model id', async () => {
    const { registry, logger } = setup([
      row('mock-music-a', {
        capabilities: { ...capabilities('a'), maxDurationSec: 999 },
      }),
      row('mock-music-b'),
    ]);
    expect((await registry.usableModels()).map((model) => model.id)).toEqual([
      'mock-music-b',
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      { modelId: 'mock-music-a' },
      'Model capability mismatch',
    );
  });

  it('disables rows with an unknown adapter and skips disabled rows', async () => {
    const { registry, logger } = setup([
      row('ghost-model', { adapter: 'ghost' }),
      row('mock-music-b', { enabled: false }),
    ]);
    expect(await registry.usableModels()).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      { modelId: 'ghost-model' },
      'Unknown model adapter',
    );
  });

  it('hides providers with an open breaker but keeps half-open ones', async () => {
    const { registry } = setup(
      [row('mock-music-a'), row('mock-music-b')],
      [
        { provider: 'mock-music-a', breaker_state: 'open' },
        { provider: 'mock-music-b', breaker_state: 'half_open' },
      ],
    );
    expect((await registry.usableModels()).map((model) => model.id)).toEqual([
      'mock-music-b',
    ]);
  });

  it('applies provider and operation kill switches', async () => {
    const { registry } = setup(
      [row('mock-music-a'), row('mock-music-b')],
      [],
      ({ provider, operation }) =>
        provider === 'mock-music-b' || operation === 'stems',
    );
    expect((await registry.usableModels()).map((model) => model.id)).toEqual([
      'mock-music-a',
    ]);
    expect(await registry.usableModels('stems')).toEqual([]);
  });

  it('caches the catalogue for 30 seconds', async () => {
    const { registry, load, advance } = setup([row('mock-music-a')]);
    await registry.usableModels();
    advance(29_999);
    await registry.usableModels();
    expect(load).toHaveBeenCalledTimes(1);
    advance(1);
    await registry.usableModels();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the catalogue cannot be read', async () => {
    const logger = { error: vi.fn() };
    const registry = createRegistryCache({
      factories: mockFactories(runtime),
      flags: { killSwitch: () => Promise.resolve(false) },
      logger,
      load: () => Promise.reject(new Error('down')),
      health: () => Promise.resolve([]),
      now: () => 0,
    });
    expect(await registry.usableModels()).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith('Catalogue refresh failed');
  });
});
