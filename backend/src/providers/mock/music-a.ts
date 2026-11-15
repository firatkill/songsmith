import { providerCall } from '../errors.js';
import type { MusicAdapter } from '../types.js';
import { makeAudio } from './audio.js';
import {
  capabilities,
  estimate,
  invalid,
  requestText,
  tempoFor,
  validateMusic,
  MUSIC_COST_MICRO_USD,
} from './music.js';
import { simulate, type MockRuntime } from './latency.js';
export function createMusicA(runtime: MockRuntime): MusicAdapter {
  const cap = capabilities('a');
  return {
    id: 'mock-music-a',
    capabilities: () => structuredClone(cap),
    estimateCostMicroUsd: (op) => estimate(cap, op),
    generate: (req, ctx) =>
      providerCall(async () => {
        const durationMs = validateMusic(cap, req, 'generate');
        await simulate(runtime, requestText(req), ctx.signal);
        return {
          kind: 'done',
          output: makeAudio(durationMs, req.format, tempoFor(requestText(req))),
          costMicroUsd: MUSIC_COST_MICRO_USD,
        };
      }),
    extend: () => providerCall(invalid),
    stems: () => providerCall(invalid),
  };
}
