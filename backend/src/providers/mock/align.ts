import { providerCall, ProviderError } from '../errors.js';
import type { AlignmentAdapter } from '../types.js';
import { simulate, type MockRuntime } from './latency.js';
export function createAlign(runtime: MockRuntime): AlignmentAdapter {
  return {
    id: 'mock-align',
    align: (audio, lyrics, _language, ctx) =>
      providerCall(async () => {
        if (!Number.isFinite(audio.durationMs) || audio.durationMs <= 0)
          throw new ProviderError('invalid_request', false);
        await simulate(runtime, lyrics, ctx.signal);
        const lines = lyrics
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter((line) => line && !/^\[[^\]]+\]$/u.test(line));
        return {
          lines: lines.map((text, index) => {
            const startMs = (audio.durationMs * index) / lines.length;
            const endMs = (audio.durationMs * (index + 1)) / lines.length;
            const words = text.split(/\s+/u);
            return {
              text,
              startMs,
              endMs,
              words: words.map((word, i) => ({
                text: word,
                startMs: startMs + ((endMs - startMs) * i) / words.length,
                endMs: startMs + ((endMs - startMs) * (i + 1)) / words.length,
              })),
            };
          }),
        };
      }),
  };
}
