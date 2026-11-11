import { expect, it } from 'vitest';
import {
  flagRegistry,
  publicFlagsSchema,
  microUsdSchema,
  rateLimitValueSchema,
} from './flags.js';
it('every registry entry has a valid default, description and scoped key', () => {
  for (const [key, entry] of Object.entries(flagRegistry)) {
    expect(key).toMatch(/^[a-z_]+(?::[a-z0-9_-]+)*$/);
    expect(entry.schema.safeParse(entry.default).success, key).toBe(true);
    expect(entry.description.length).toBeGreaterThan(0);
    expect(typeof entry.placeholder).toBe('boolean');
  }
});
it('public set is exactly all, seeded providers and generation operations', () => {
  const expected = [
    'kill_switch:all',
    ...[
      'mock-music-a',
      'mock-music-b',
      'mock-text',
      'mock-image',
      'mock-image-safety',
      'mock-align',
    ].map((p) => `kill_switch:provider:${p}`),
    ...[
      'generate',
      'instrumental',
      'custom_lyrics',
      'image_input',
      'lyrics',
      'rewrite',
      'extend',
      'remix',
      'stems',
      'cover',
      'align',
      'video',
    ].map((op) => `kill_switch:operation:${op}`),
  ];
  expect(Object.keys(publicFlagsSchema.shape).sort()).toEqual(expected.sort());
  expect(
    Object.entries(flagRegistry)
      .filter(([, entry]) => entry.public)
      .map(([key]) => key)
      .sort(),
  ).toEqual(expected);
});
it('preserves D-26 defaults and marks every HTTP limit and cap as a placeholder', () => {
  expect(
    Object.fromEntries(
      Object.entries(flagRegistry)
        .filter(([key]) => !key.includes(':'))
        .map(([key, entry]) => [key, entry.default]),
    ),
  ).toEqual({
    music_queue_concurrency: 4,
    per_user_concurrency: 2,
    block_window_seconds: 86400,
    block_cooldown_threshold: 3,
    block_cooldown_seconds: 3600,
    block_suspend_threshold: 6,
  });
  for (const [key, entry] of Object.entries(flagRegistry)) {
    if (key.startsWith('cap:') || key.startsWith('rate_limit:'))
      expect(entry.placeholder).toBe(true);
  }
});
it('rejects fractional/unsafe money and unbounded rate windows', () => {
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    expect(microUsdSchema.safeParse(value).success).toBe(false);
  expect(
    rateLimitValueSchema.safeParse({ max: 3, windowSeconds: 86401 }).success,
  ).toBe(false);
});
