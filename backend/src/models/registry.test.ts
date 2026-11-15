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
    display_name: id,
    quality_rank: 20,
    model_prices: [{ operation: 'generate', credits: 10 }],
    model_languages: [{ language: 'en', status: 'verified' }],
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

describe('public catalogue registry view', () => {
  it('maps public fields, omits non-music, disabled, unknown and mismatched models', async () => {
    const { registry } = setup([
      row('mock-music-a'),
      row('mock-text', { model_prices: [{ operation: 'lyrics', credits: 1 }] }),
      row('mock-music-b', { enabled: false }),
      row('ghost'),
      row('mismatch', {
        kind: 'music',
        adapter: 'mock-music-b',
        capabilities: capabilities('a'),
      }),
    ]);
    expect((await registry.usableModels()).map(({ id }) => id)).toEqual([
      'mock-music-a',
      'mock-text',
    ]);
    expect(await registry.catalogue()).toEqual([
      {
        id: 'mock-music-a',
        displayName: 'mock-music-a',
        qualityRank: 20,
        capabilities: capabilities('a'),
        prices: { generate: 10 },
        languages: { en: 'verified' },
        available: true,
      },
    ]);
  });
  it('silently omits prices for operations the music router does not handle', async () => {
    const { registry, logger } = setup([
      row('mock-music-b', {
        model_prices: [
          { operation: 'generate', credits: 10 },
          { operation: 'extend', credits: 15 },
          { operation: 'remix', credits: 20 },
        ],
      }),
    ]);
    const models = await registry.catalogue();
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: 'mock-music-b',
      available: true,
    });
    expect(models[0]?.prices).toEqual({ generate: 10, extend: 15 });
    expect(logger.error).not.toHaveBeenCalled();
  });
  it('reads breaker and kill-switch availability afresh without reloading catalogue rows', async () => {
    const health = [{ provider: 'mock-music-a', breaker_state: 'closed' }];
    let killed = false;
    const { registry, load } = setup(
      [row('mock-music-a'), row('mock-music-b')],
      health,
      ({ provider, operation }) =>
        (killed && provider === 'mock-music-b') || operation === 'stems',
    );
    expect((await registry.catalogue()).every((model) => model.available)).toBe(
      true,
    );
    health[0] = { provider: 'mock-music-a', breaker_state: 'open' };
    killed = true;
    expect(
      (await registry.catalogue()).map(({ available }) => available),
    ).toEqual([false, false]);
    health[0] = { provider: 'mock-music-a', breaker_state: 'half_open' };
    killed = false;
    expect((await registry.catalogue()).every((model) => model.available)).toBe(
      true,
    );
    expect(
      (await registry.catalogue('stems')).every((model) => !model.available),
    ).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('shares the 30 s cache and invalidation with usableModels, returning detached data', async () => {
    const rows = [row('mock-music-a')];
    const { registry, load, advance } = setup(rows);
    const first = await registry.catalogue();
    first[0]?.capabilities.operations.pop();
    rows[0] = row('mock-music-a', { quality_rank: 42 });
    advance(29_999);
    expect((await registry.catalogue())[0]?.qualityRank).toBe(20);
    expect((await registry.catalogue())[0]?.capabilities).toEqual(
      capabilities('a'),
    );
    await registry.usableModels();
    expect(load).toHaveBeenCalledTimes(1);
    advance(1);
    expect((await registry.catalogue())[0]?.qualityRank).toBe(42);
    rows[0] = row('mock-music-a', { enabled: false });
    registry.invalidate();
    expect(await registry.catalogue()).toEqual([]);
    expect(await registry.usableModels()).toEqual([]);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it('fails closed on invalid joined data and retries after one second', async () => {
    const { registry, load, advance } = setup([row('mock-music-a')]);
    await registry.catalogue();
    load.mockResolvedValueOnce([
      row('mock-music-a', {
        model_prices: [{ operation: 'generate', credits: 1.5 }],
      }),
    ]);
    registry.invalidate();
    expect(await registry.catalogue()).toEqual([]);
    advance(999);
    expect(await registry.catalogue()).toEqual([]);
    advance(1);
    expect(await registry.catalogue()).toHaveLength(1);
  });
});
