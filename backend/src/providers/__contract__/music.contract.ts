// Shared MusicAdapter contract (TRD §8.6). IT-10 runs it against the mocks; EV-04 will
// run it against live adapters in M6 with `--mode live`.
import { describe, expect, it } from 'vitest';
import { operationSchema, type Operation } from '@songsmith/schemas';
import { ProviderError } from '../errors.js';
import type {
  AudioOutput,
  GenerateRequest,
  MusicAdapter,
  ProviderContext,
  StartResult,
  StemsOutput,
} from '../types.js';

export interface MusicContractOptions {
  // Allowed difference between requested and returned duration.
  durationToleranceMs: number;
  // Requests that make the adapter fail with the given code (mock triggers today).
  failures: { text: string; code: ProviderError['code']; retryable: boolean }[];
}

export function context(
  signal = new AbortController().signal,
): ProviderContext {
  return {
    jobId: 'contract-job',
    userId: 'contract-user',
    correlationId: 'contract-correlation',
    signal,
  };
}

function request(overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    description: 'contract test song',
    language: 'en',
    durationSec: 5,
    format: 'mp3',
    ...overrides,
  };
}

async function settle<T>(
  adapter: MusicAdapter,
  result: StartResult<T>,
): Promise<AudioOutput | StemsOutput | T> {
  let current: StartResult<AudioOutput | StemsOutput | T> = result;
  for (let attempts = 0; current.kind === 'pending'; attempts++) {
    expect(adapter.poll, 'pending results require poll()').toBeTypeOf(
      'function',
    );
    expect(current.pollAfterMs).toBeGreaterThan(0);
    expect(attempts).toBeLessThan(20);
    const poll = adapter.poll;
    if (!poll) throw new Error('poll missing');
    current = await poll(current.taskId, context());
  }
  return current.output;
}

async function bytesOf(audio: AudioOutput) {
  if (audio.bytes instanceof Uint8Array) return audio.bytes;
  const chunks: Uint8Array[] = [];
  for await (const chunk of audio.bytes) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function isAudio(value: unknown): value is AudioOutput {
  return typeof value === 'object' && value !== null && 'durationMs' in value;
}

async function expectProviderError(
  run: () => Promise<unknown>,
  code: ProviderError['code'],
) {
  const error = await run().then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ProviderError);
  expect((error as ProviderError).code).toBe(code);
  return error as ProviderError;
}

export function musicContract(
  name: string,
  create: () => MusicAdapter,
  options: MusicContractOptions,
) {
  describe(`MusicAdapter contract: ${name}`, () => {
    const adapter = create();
    const cap = adapter.capabilities();

    it('declares a valid id and capabilities', () => {
      expect(adapter.id).toBe(name);
      expect(cap.operations.length).toBeGreaterThan(0);
      expect(cap.minDurationSec).toBeLessThanOrEqual(cap.maxDurationSec);
    });

    it('estimates integer costs for supported operations only', () => {
      for (const op of operationSchema.options) {
        if (cap.operations.includes(op)) {
          const cost = adapter.estimateCostMicroUsd(op, request());
          expect(Number.isSafeInteger(cost)).toBe(true);
          expect(cost).toBeGreaterThanOrEqual(0);
        } else
          expect(() => adapter.estimateCostMicroUsd(op, request())).toThrow(
            ProviderError,
          );
      }
    });

    for (const format of cap.outputFormats)
      it(`generates ${format} audio of the requested length`, async () => {
        const output = await settle(
          adapter,
          await adapter.generate(request({ format }), context()),
        );
        expect(isAudio(output)).toBe(true);
        if (!isAudio(output)) return;
        expect(output.format).toBe(format);
        expect(Math.abs(output.durationMs - 5000)).toBeLessThanOrEqual(
          options.durationToleranceMs,
        );
        expect((await bytesOf(output)).length).toBeGreaterThan(0);
      });

    it('rejects durations outside the declared limits', async () => {
      await expectProviderError(
        () =>
          adapter.generate(
            request({ durationSec: cap.maxDurationSec + 1 }),
            context(),
          ),
        'invalid_request',
      );
      await expectProviderError(
        () =>
          adapter.generate(
            request({ durationSec: cap.minDurationSec - 1 }),
            context(),
          ),
        'invalid_request',
      );
    });

    it('rejects undeclared output formats', async () => {
      for (const format of ['mp3', 'wav'] as const)
        if (!cap.outputFormats.includes(format))
          await expectProviderError(
            () => adapter.generate(request({ format }), context()),
            'invalid_request',
          );
    });

    const undeclared = (op: Operation) => !cap.operations.includes(op);
    it('rejects undeclared operations with invalid_request', async () => {
      if (undeclared('custom_lyrics'))
        await expectProviderError(
          () => adapter.generate(request({ lyrics: 'la la' }), context()),
          'invalid_request',
        );
      if (undeclared('instrumental'))
        await expectProviderError(
          () => adapter.generate(request({ instrumental: true }), context()),
          'invalid_request',
        );
      if (undeclared('image_input'))
        await expectProviderError(
          () =>
            adapter.generate(
              request({ image: new Uint8Array([1]) }),
              context(),
            ),
          'invalid_request',
        );
      const extend = adapter.extend;
      if (undeclared('extend') && extend)
        await expectProviderError(
          () =>
            extend(
              {
                ...request(),
                audio: {
                  bytes: new Uint8Array([1]),
                  format: 'mp3',
                  durationMs: 5000,
                },
              },
              context(),
            ),
          'invalid_request',
        );
      const stems = adapter.stems;
      if (undeclared('stems') && stems)
        await expectProviderError(
          () =>
            stems(
              {
                audio: {
                  bytes: new Uint8Array([1]),
                  format: 'mp3',
                  durationMs: 5000,
                },
                stemSet: 'two_stems',
                format: 'mp3',
              },
              context(),
            ),
          'invalid_request',
        );
    });

    if (cap.operations.includes('extend'))
      it('extends external audio when declared', async () => {
        const extend = adapter.extend;
        expect(extend).toBeTypeOf('function');
        if (!extend) return;
        const output = await settle(
          adapter,
          await extend(
            {
              ...request(),
              audio: {
                bytes: new Uint8Array([1, 2, 3]),
                format: 'mp3',
                durationMs: 5000,
              },
            },
            context(),
          ),
        );
        expect(isAudio(output)).toBe(true);
      });

    for (const stemSet of cap.stemSets)
      it(`separates ${stemSet} into distinct stems`, async () => {
        const stems = adapter.stems;
        expect(stems).toBeTypeOf('function');
        if (!stems) return;
        const output = await settle(
          adapter,
          await stems(
            {
              audio: {
                bytes: new Uint8Array([1, 2, 3]),
                format: 'mp3',
                durationMs: 5000,
              },
              stemSet: stemSet === 'six_stems' ? 'six_stems' : 'two_stems',
              format: 'mp3',
            },
            context(),
          ),
        );
        expect(isAudio(output)).toBe(false);
        const { stems: parts } = output as StemsOutput;
        expect(parts.length).toBe(stemSet === 'six_stems' ? 6 : 2);
        const hashes = new Set(
          await Promise.all(
            parts.map(async (part) =>
              Buffer.from(await bytesOf(part.audio)).toString('base64'),
            ),
          ),
        );
        expect(hashes.size).toBe(parts.length);
      });

    if (adapter.poll)
      it('rejects poll task ids it did not issue', async () => {
        const poll = adapter.poll;
        if (!poll) return;
        await expectProviderError(
          () => poll('not-a-task', context()),
          'invalid_request',
        );
      });

    for (const failure of options.failures)
      it(`maps failures to ProviderError ${failure.code}`, async () => {
        const error = await expectProviderError(
          () =>
            adapter.generate(request({ description: failure.text }), context()),
          failure.code,
        );
        expect(error.retryable).toBe(failure.retryable);
      });

    it('maps an aborted signal to a retryable timeout', async () => {
      const controller = new AbortController();
      controller.abort();
      const error = await expectProviderError(
        () => adapter.generate(request(), context(controller.signal)),
        'timeout',
      );
      expect(error.retryable).toBe(true);
    });
  });
}
