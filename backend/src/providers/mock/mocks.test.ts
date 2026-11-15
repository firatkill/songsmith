import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { PNG } from 'pngjs';
import { z } from 'zod';
import { classifierOutputSchema, lyricsSchema } from '@songsmith/schemas';
import { musicContract, context } from '../__contract__/music.contract.js';
import { ProviderError, providerCall } from '../errors.js';
import type { ImageAdapter, TextAdapter } from '../types.js';
import { createAlign } from './align.js';
import {
  AUDIO_GRANULARITY_MS,
  encodeMp3,
  encodeWav,
  synthesize,
  TEMPOS,
} from './audio.js';
import { createImage } from './image.js';
import { createImageSafety } from './image-safety.js';
import { mockFactories } from './index.js';
import { simulate, type MockRuntime } from './latency.js';
import { createMusicA } from './music-a.js';
import { createMusicB } from './music-b.js';
import { capabilities } from './music.js';
import { createText } from './text.js';

function runtime(overrides: Partial<MockRuntime> = {}): MockRuntime {
  return {
    mode: 'mock',
    latencyMs: 3000,
    failureRate: 0,
    now: () => 0,
    random: () => 0.5,
    sleep: () => Promise.resolve(),
    ...overrides,
  };
}

const failures = [
  { text: '⟦mock:fail:timeout⟧', code: 'timeout', retryable: true },
  { text: '⟦mock:fail:rate_limited⟧', code: 'rate_limited', retryable: true },
  {
    text: '⟦mock:fail:provider_policy⟧',
    code: 'rejected_by_provider_policy',
    retryable: false,
  },
] as const;

// IT-10: the shared contract suite against both mock music models.
musicContract('mock-music-a', () => createMusicA(runtime()), {
  durationToleranceMs: AUDIO_GRANULARITY_MS,
  failures: [...failures],
});
musicContract('mock-music-b', () => createMusicB(runtime()), {
  durationToleranceMs: AUDIO_GRANULARITY_MS,
  failures: [...failures],
});

describe('mock music shapes (TRD §8.4)', () => {
  it('A is synchronous and B is pending then polled', async () => {
    const request = {
      description: 'shape',
      language: 'en',
      durationSec: 2,
      format: 'mp3' as const,
    };
    const a = await createMusicA(runtime()).generate(request, context());
    expect(a.kind).toBe('done');
    const b = await createMusicB(runtime()).generate(request, context());
    expect(b.kind).toBe('pending');
  });

  it('B poll ids are bound to the job and user that started them', async () => {
    const adapter = createMusicB(runtime());
    const started = await adapter.generate(
      { description: 'owner', language: 'en', durationSec: 2, format: 'mp3' },
      context(),
    );
    if (started.kind !== 'pending') throw new Error('expected pending');
    expect(started.taskId).not.toContain('owner');
    const poll = adapter.poll;
    if (!poll) throw new Error('poll missing');
    await expect(
      poll(started.taskId, { ...context(), userId: 'someone-else' }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('matches the seeded catalogue capabilities', async () => {
    const seed = await readFile(
      new URL('../../../../supabase/seed.sql', import.meta.url),
      'utf8',
    );
    for (const id of ['mock-music-a', 'mock-music-b'] as const) {
      const line = seed.split('\n').find((row) => row.startsWith(`('${id}'`));
      const json = line?.match(/'(\{.*\})'::jsonb/u)?.[1];
      expect(json, id).toBeDefined();
      expect(JSON.parse(json ?? '{}')).toEqual(
        capabilities(id === 'mock-music-a' ? 'a' : 'b'),
      );
    }
  });
});

describe('mock latency, failures and triggers', () => {
  it('applies latency with ±30% jitter through the injected sleep', async () => {
    const sleep = vi.fn<MockRuntime['sleep']>(() => Promise.resolve());
    await simulate(runtime({ sleep, random: () => 0 }), 'x', context().signal);
    await simulate(runtime({ sleep, random: () => 1 }), 'x', context().signal);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([2100, 3900]);
  });

  it('slows down tenfold for ⟦mock:slow⟧', async () => {
    const sleep = vi.fn<MockRuntime['sleep']>(() => Promise.resolve());
    await simulate(runtime({ sleep }), '⟦mock:slow⟧', context().signal);
    expect(sleep).toHaveBeenCalledWith(30000, expect.anything());
  });

  it('fails randomly at MOCK_FAILURE_RATE with a retryable unavailable', async () => {
    await expect(
      simulate(
        runtime({ failureRate: 0.6, random: () => 0.5 }),
        'x',
        context().signal,
      ),
    ).rejects.toMatchObject({ code: 'unavailable', retryable: true });
  });

  it('rate_limited carries retryAfterMs', async () => {
    await expect(
      simulate(runtime(), '⟦mock:fail:rate_limited⟧', context().signal),
    ).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: 5000 });
  });

  it('ignores triggers outside mock mode', async () => {
    for (const failure of failures)
      await expect(
        simulate(runtime({ mode: 'live' }), failure.text, context().signal),
      ).resolves.toBeUndefined();
  });

  it('wraps unknown errors without keeping their message', async () => {
    const error = await providerCall(() => {
      throw new Error('secret lyric text');
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ code: 'unknown', retryable: false });
    expect((error as Error).message).not.toContain('secret');
  });
});

describe('audio fixtures', () => {
  const directory = new URL('./fixtures/', import.meta.url);

  it('stay under 3 MB in total', async () => {
    const files = await readdir(directory);
    const sizes = await Promise.all(
      files.map(async (file) => (await stat(new URL(file, directory))).size),
    );
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThan(
      3 * 1024 * 1024,
    );
  });

  it('are exactly what the deterministic synthesiser produces', async () => {
    for (const tempo of TEMPOS) {
      const pcm = synthesize(tempo);
      const hash = (bytes: Uint8Array) =>
        createHash('sha256').update(bytes).digest('hex');
      expect(hash(encodeWav(pcm))).toBe(
        hash(await readFile(new URL(`${String(tempo)}.wav`, directory))),
      );
      expect(hash(encodeMp3(pcm))).toBe(
        hash(await readFile(new URL(`${String(tempo)}.mp3`, directory))),
      );
    }
  });
});

describe('mock text', () => {
  const text = (): TextAdapter => createText(runtime());

  it('classifier returns the marker category, else none with low confidence', async () => {
    const marked = await text().completeJson(
      {
        system: 'any real classifier prompt',
        user: 'test row ⟦mock:minor_sexual⟧',
        schema: classifierOutputSchema,
        maxTokens: 100,
      },
      context(),
    );
    expect(marked.value).toMatchObject({
      category: 'minor_sexual',
      severity: 'critical',
      confidence: 1,
    });
    const plain = await text().completeJson(
      {
        system: 'any real classifier prompt',
        user: 'an ordinary request',
        schema: classifierOutputSchema,
        maxTokens: 100,
      },
      context(),
    );
    expect(plain.value).toMatchObject({ category: 'none' });
    expect(plain.value.confidence).toBeLessThan(0.5);
  });

  for (const language of ['tr', 'en'] as const)
    it(`lyricist returns valid sections in ${language}`, async () => {
      const result = await text().completeJson(
        {
          system: 'any real lyricist prompt',
          user: JSON.stringify({
            task: 'write',
            language,
            description: 'summer road trip with friends',
            occasion: 'birthday',
            giftNames: ['Ada'],
          }),
          schema: lyricsSchema,
          maxTokens: 500,
        },
        context(),
      );
      expect(result.value.language).toBe(language);
      expect(result.value.sections.length).toBeGreaterThan(0);
      expect(JSON.stringify(result.value)).toContain('Ada');
      expect(Number.isSafeInteger(result.costMicroUsd)).toBe(true);
    });

  it('rejects output that does not fit the requested schema', async () => {
    await expect(
      text().completeJson(
        {
          system: 'x',
          user: 'not json',
          schema: z.object({ other: z.string() }),
          maxTokens: 10,
        },
        context(),
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});

describe('mock image, safety and alignment', () => {
  const image = (): ImageAdapter => createImage(runtime());

  it('cover is a deterministic 1024×1024 PNG per title', async () => {
    const one = await image().cover({ title: 'Summer' }, context());
    const two = await image().cover({ title: 'Summer' }, context());
    const other = await image().cover({ title: 'Winter' }, context());
    const png = PNG.sync.read(Buffer.from(one.png));
    expect([png.width, png.height]).toEqual([1024, 1024]);
    expect(Buffer.compare(one.png, two.png)).toBe(0);
    expect(Buffer.compare(one.png, other.png)).not.toBe(0);
  });

  it('image safety flags only the magenta fixture', async () => {
    const safety = createImageSafety(runtime());
    const cover = await image().cover({ title: 'Safe' }, context());
    expect(await safety.check(cover.png, context())).toEqual({
      safe: true,
      categories: [],
    });
    const unsafe = new PNG({ width: 1, height: 1 });
    unsafe.data.set([255, 0, 255, 255]);
    expect(await safety.check(PNG.sync.write(unsafe), context())).toMatchObject(
      { safe: false },
    );
  });

  it('alignment spreads lines and words evenly and skips section tags', async () => {
    const timings = await createAlign(runtime()).align(
      { bytes: new Uint8Array([1]), format: 'mp3', durationMs: 4000 },
      '[Verse]\none two\nthree four',
      'en',
      context(),
    );
    expect(timings.lines.map((line) => [line.startMs, line.endMs])).toEqual([
      [0, 2000],
      [2000, 4000],
    ]);
    expect(timings.lines[0]?.words.map((word) => word.endMs)).toEqual([
      1000, 2000,
    ]);
  });

  it('registers every seeded mock adapter', () => {
    expect([...mockFactories(runtime()).keys()].sort()).toEqual([
      'mock-align',
      'mock-image',
      'mock-image-safety',
      'mock-music-a',
      'mock-music-b',
      'mock-text',
    ]);
  });
});
