import { setTimeout } from 'node:timers/promises';
import type { Env } from '../../lib/env.js';
import { ProviderError } from '../errors.js';
import { failureTrigger, slowTrigger } from './triggers.js';
export interface MockRuntime {
  mode: 'mock' | 'live';
  latencyMs: number;
  failureRate: number;
  now: () => number;
  random: () => number;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
}
export function mockRuntime(
  env: Pick<Env, 'PROVIDER_MODE' | 'MOCK_LATENCY_MS' | 'MOCK_FAILURE_RATE'>,
  overrides: Partial<MockRuntime> = {},
): MockRuntime {
  return {
    mode: env.PROVIDER_MODE,
    latencyMs: env.MOCK_LATENCY_MS,
    failureRate: env.MOCK_FAILURE_RATE,
    now: Date.now,
    random: Math.random,
    sleep: async (ms, signal) => {
      await setTimeout(ms, undefined, { signal });
    },
    ...overrides,
  };
}
export async function simulate(
  runtime: MockRuntime,
  text: string,
  signal: AbortSignal,
) {
  if (aborted(signal)) throw new ProviderError('timeout', true);
  failureTrigger(text, runtime.mode);
  const delay =
    Math.round(runtime.latencyMs * (0.7 + runtime.random() * 0.6)) *
    (slowTrigger(text, runtime.mode) ? 10 : 1);
  try {
    await runtime.sleep(delay, signal);
  } catch (error) {
    if (!aborted(signal)) throw error;
    throw new ProviderError('timeout', true);
  }
  if (aborted(signal)) throw new ProviderError('timeout', true);
  if (runtime.random() < runtime.failureRate)
    throw new ProviderError('unavailable', true);
}

// A function call stops TypeScript from narrowing `aborted`, which changes while awaiting.
function aborted(signal: AbortSignal) {
  return signal.aborted;
}
