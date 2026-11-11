import { afterEach, expect, it, vi } from 'vitest';
import { createFlagCache } from './flags.js';
const logger = () => ({ warn: vi.fn(), error: vi.fn() });
afterEach(() => {
  vi.useRealTimers();
});
it('UT-07 caches for 30 seconds, then refreshes', async () => {
  vi.useFakeTimers();
  const load = vi.fn(() =>
    Promise.resolve([{ key: 'music_queue_concurrency', value: 7 }]),
  );
  const flags = createFlagCache(load, logger());
  expect(await flags.getFlag('music_queue_concurrency')).toBe(7);
  await vi.advanceTimersByTimeAsync(29_999);
  expect(await flags.getFlag('music_queue_concurrency')).toBe(7);
  expect(load).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await flags.getFlags();
  expect(load).toHaveBeenCalledTimes(2);
});
it('UT-07 shares a single refresh and callers cannot mutate cached values', async () => {
  const load = vi.fn(() => Promise.resolve([]));
  const flags = createFlagCache(load, logger());
  const [a, b] = await Promise.all([flags.getFlags(), flags.getFlags()]);
  a['rate_limit:me_patch'].max = 999;
  expect(b['rate_limit:me_patch'].max).toBe(30);
  expect((await flags.getFlag('rate_limit:me_patch')).max).toBe(30);
  expect(load).toHaveBeenCalledTimes(1);
});
it('UT-07 refresh errors serve stale and log, then recover', async () => {
  let now = 0;
  const load = vi
    .fn<() => Promise<unknown>>()
    .mockResolvedValueOnce([{ key: 'kill_switch:all', value: true }])
    .mockRejectedValueOnce(new Error('private data'))
    .mockResolvedValue([]);
  const log = logger();
  const flags = createFlagCache(load, log, () => now);
  expect(await flags.killSwitch()).toBe(true);
  now = 30_000;
  expect(await flags.killSwitch()).toBe(true);
  expect(log.error).toHaveBeenCalledOnce();
  expect(JSON.stringify(log.error.mock.calls)).not.toContain('private data');
  now += 1000;
  expect(await flags.killSwitch()).toBe(false);
});
it('UT-07 invalid values use defaults; unknown keys are ignored without leaking contents', async () => {
  const log = logger();
  const flags = createFlagCache(
    () =>
      Promise.resolve([
        { key: 'music_queue_concurrency', value: 'private data' },
        { key: 'unknown private data', value: true },
      ]),
    log,
  );
  expect((await flags.getFlags()).music_queue_concurrency).toBe(4);
  expect(await flags.getFlags()).not.toHaveProperty('unknown private data');
  expect(log.warn).toHaveBeenCalledOnce();
  expect(log.error).toHaveBeenCalledOnce();
  expect(
    JSON.stringify([...log.warn.mock.calls, ...log.error.mock.calls]),
  ).not.toContain('private data');
});
it('UT-07 hung refresh times out, aborts and never publishes a late result', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  let resolve: ((data: unknown) => void) | undefined;
  const flags = createFlagCache((s) => {
    signal = s;
    return new Promise((r) => {
      resolve = r;
    });
  }, logger());
  const pending = flags.getFlag('kill_switch:all');
  await vi.advanceTimersByTimeAsync(2000);
  expect(await pending).toBe(false);
  expect(signal?.aborted).toBe(true);
  resolve?.([{ key: 'kill_switch:all', value: true }]);
  expect(await flags.killSwitch()).toBe(false);
});
it('killSwitch combines all, provider and operation without cross-scope leakage', async () => {
  const flags = createFlagCache(
    () =>
      Promise.resolve([
        { key: 'kill_switch:provider:mock-text', value: true },
        { key: 'kill_switch:operation:generate', value: true },
      ]),
    logger(),
  );
  expect(await flags.killSwitch({ provider: 'mock-text' })).toBe(true);
  expect(await flags.killSwitch({ operation: 'generate' })).toBe(true);
  expect(
    await flags.killSwitch({ provider: 'mock-music-a', operation: 'extend' }),
  ).toBe(false);
});
