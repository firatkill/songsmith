// Entry point for the evaluation harness (`@songsmith/eval`, T-16). It exposes
// the moderation layers and adapter factories without any database access.
import type { Env } from './lib/env.js';
import { loadFactories } from './models/registry.js';
import type { TextAdapter } from './providers/types.js';
import { mockFactories } from './providers/mock/index.js';
import { mockRuntime } from './providers/mock/latency.js';
export { runLayers, combineParts } from './moderation/pipeline.js';
export type { ClassifierOutput } from './moderation/pipeline.js';
export { POLICY_VERSION } from './moderation/prompt.js';
export { ProviderError } from './providers/errors.js';
export { writeLyrics, nameMissing } from './lyricist/index.js';
export { LYRICIST_PROMPT_VERSION } from './lyricist/prompt.js';
export { detectLanguage, languageMatches } from './lyricist/language.js';
export { AppError } from './lib/errors.js';
export type { TextAdapter } from './providers/types.js';

// Mock mode: the mock text adapter with no latency or random failures.
export function mockTextAdapter(): TextAdapter {
  const adapter = mockFactories(
    mockRuntime({
      PROVIDER_MODE: 'mock',
      MOCK_LATENCY_MS: 0,
      MOCK_FAILURE_RATE: 0,
    }),
  ).get('mock-text')?.();
  if (!adapter || !('completeJson' in adapter))
    throw new Error('mock-text adapter missing');
  return adapter;
}

// Live mode: a live text adapter by id. Live adapters arrive in M6, so this
// fails clearly until then.
export async function liveTextAdapter(
  appEnv: Env['APP_ENV'],
  adapterId: string,
): Promise<TextAdapter> {
  const factories = await loadFactories({
    APP_ENV: appEnv,
    PROVIDER_MODE: 'live',
    MOCK_LATENCY_MS: 0,
    MOCK_FAILURE_RATE: 0,
  });
  const adapter = factories.get(adapterId)?.();
  if (
    !adapter ||
    adapter.id.startsWith('mock-') ||
    !('completeJson' in adapter)
  )
    throw new Error(`No live text adapter "${adapterId}" is registered`);
  return adapter;
}
