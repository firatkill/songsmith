import { providerCall } from '../errors.js';
import type {
  MusicAdapter,
  ProviderContext,
  StartResult,
  AudioOutput,
  StemsOutput,
} from '../types.js';
import { makeAudio, makeStems } from './audio.js';
import {
  capabilities,
  estimate,
  invalid,
  requestText,
  tempoFor,
  validateMusic,
  ownerKey,
  taskSchema,
  MUSIC_COST_MICRO_USD,
  STEMS_COST_MICRO_USD,
} from './music.js';
import { simulate, type MockRuntime } from './latency.js';
export function createMusicB(runtime: MockRuntime): MusicAdapter {
  const cap = capabilities('b');
  async function start(
    durationMs: number,
    text: string,
    ctx: ProviderContext,
    stemSet?: 'two_stems' | 'six_stems',
  ): Promise<StartResult<AudioOutput> & StartResult<StemsOutput>> {
    await simulate(runtime, text, ctx.signal);
    // No input text in task IDs. The persisted ID is enough to poll after restart.
    const task = {
      version: 1,
      owner: ownerKey(ctx),
      durationMs,
      tempo: tempoFor(text),
      ...(stemSet ? { stemSet } : {}),
    };
    return {
      kind: 'pending',
      taskId: Buffer.from(JSON.stringify(task)).toString('base64url'),
      pollAfterMs: Math.max(1, runtime.latencyMs),
    };
  }
  return {
    id: 'mock-music-b',
    capabilities: () => structuredClone(cap),
    estimateCostMicroUsd: (op) => estimate(cap, op),
    generate: (req, ctx) =>
      providerCall(() =>
        start(validateMusic(cap, req, 'generate'), requestText(req), ctx),
      ),
    extend: (req, ctx) =>
      providerCall(() =>
        start(validateMusic(cap, req, 'extend'), requestText(req), ctx),
      ),
    stems: (req, ctx) =>
      providerCall(() =>
        start(validateMusic(cap, req, 'stems'), '', ctx, req.stemSet),
      ),
    poll: (taskId, ctx) =>
      providerCall(async () => {
        let raw: unknown;
        try {
          raw = JSON.parse(Buffer.from(taskId, 'base64url').toString('utf8'));
        } catch {
          return invalid();
        }
        const parsed = taskSchema.safeParse(raw);
        if (!parsed.success || parsed.data.owner !== ownerKey(ctx)) invalid();
        const task = parsed.data;
        await simulate(runtime, '', ctx.signal);
        return {
          kind: 'done',
          output: task.stemSet
            ? makeStems(task.durationMs, task.tempo, task.stemSet)
            : makeAudio(task.durationMs, 'mp3', task.tempo),
          costMicroUsd: task.stemSet
            ? STEMS_COST_MICRO_USD
            : MUSIC_COST_MICRO_USD,
        };
      }),
  };
}
