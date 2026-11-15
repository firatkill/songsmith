import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  registryCatalogueRowSchema,
  catalogueModelSchema,
  type CatalogueModel,
  musicCapabilitiesSchema,
  operationSchema,
  emptyCapabilitiesSchema,
  providerHealthSchema,
} from '@songsmith/schemas';
import type { Adapter } from '../providers/types.js';
import { mockFactories } from '../providers/mock/index.js';
import { mockRuntime } from '../providers/mock/latency.js';
import type { Env } from '../lib/env.js';
import type { Service } from '../lib/auth.js';
import type { FlagService } from '../lib/flags.js';
import type { Logger } from '../lib/log.js';
import { createBreakers } from './breakers.js';
export type AdapterFactories = Map<string, () => Adapter>;
export async function loadFactories(
  env: Pick<
    Env,
    'APP_ENV' | 'PROVIDER_MODE' | 'MOCK_LATENCY_MS' | 'MOCK_FAILURE_RATE'
  >,
): Promise<AdapterFactories> {
  const factories =
    env.PROVIDER_MODE === 'live'
      ? (await import('../providers/live/index.js')).liveFactories()
      : new Map<string, () => Adapter>();
  if (env.PROVIDER_MODE === 'mock' || env.APP_ENV !== 'production') {
    for (const [id, factory] of mockFactories(mockRuntime(env)))
      factories.set(id, factory);
  }
  return factories;
}
export async function createRegistry(
  service: Service,
  env: Env,
  flags: FlagService,
  logger: Logger,
) {
  const factories = await loadFactories(env);
  const registry = createRegistryCache({
    factories,
    flags,
    logger,
    load: async (signal) => {
      const result = await service()
        .from('models')
        .select(
          'id,adapter,kind,enabled,capabilities,display_name,quality_rank,model_prices(operation,credits),model_languages(language,status)',
        )
        .abortSignal(signal);
      if (result.error) throw new Error('Catalogue unavailable');
      return result.data;
    },
    health: () => createBreakers(service).states(),
  });
  await registry.usableModels(); // Validate capabilities before serving the registry.
  return registry;
}
export function createRegistryCache(options: {
  factories: AdapterFactories;
  flags: Pick<FlagService, 'killSwitch'>;
  logger: Pick<Logger, 'error'>;
  load: (signal: AbortSignal) => Promise<unknown>;
  health: () => Promise<unknown>;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let expires = -Infinity;
  let rows: z.infer<typeof registryCatalogueRowSchema>[] = [];
  let inFlight: Promise<void> | undefined;
  async function refresh() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    try {
      const raw = await Promise.race([
        options.load(controller.signal),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('Catalogue timeout'));
          }, 2000);
        }),
      ]);
      const next = z.array(registryCatalogueRowSchema).parse(raw);
      rows = next.filter((row) => {
        if (!row.enabled) return false;
        const factory = options.factories.get(row.adapter);
        if (!factory) {
          options.logger.error({ modelId: row.id }, 'Unknown model adapter');
          return false;
        }
        const adapter = factory();
        const schema =
          row.kind === 'music'
            ? musicCapabilitiesSchema
            : emptyCapabilitiesSchema;
        const declared = schema.safeParse(row.capabilities);
        const actual = schema.safeParse(
          'capabilities' in adapter ? adapter.capabilities() : {},
        );
        const kindMatches =
          row.kind === 'music'
            ? 'generate' in adapter
            : row.kind === 'text'
              ? 'completeJson' in adapter
              : row.kind === 'alignment'
                ? 'align' in adapter
                : 'cover' in adapter || 'check' in adapter;
        if (
          !kindMatches ||
          !declared.success ||
          !actual.success ||
          !isDeepStrictEqual(declared.data, actual.data)
        ) {
          options.logger.error(
            { modelId: row.id },
            'Model capability mismatch',
          );
          return false;
        }
        return true;
      });
      expires = now() + 30000;
    } catch {
      // Fail closed: stale enabled rows must not override a newer disable.
      rows = [];
      expires = now() + 1000;
      options.logger.error('Catalogue refresh failed');
    } finally {
      clearTimeout(timer);
    }
  }
  async function availableRows(operation?: string) {
    if (now() >= expires) {
      inFlight ??= refresh().finally(() => {
        inFlight = undefined;
      });
      await inFlight;
    }
    const snapshot = rows;
    // Health is intentionally fresh: an opened breaker takes effect immediately.
    const health = z.array(providerHealthSchema).parse(await options.health());
    const open = new Set(
      health
        .filter((row) => row.breaker_state === 'open')
        .map((row) => row.provider),
    );
    const usable = await Promise.all(
      snapshot.map(
        async (row) =>
          !open.has(row.adapter) &&
          !(await options.flags.killSwitch({
            provider: row.adapter,
            ...(operation ? { operation } : {}),
          })),
      ),
    );
    return snapshot.map((row, i) => ({ row, available: usable[i] === true }));
  }
  return {
    invalidate() {
      expires = -Infinity;
    },
    adapter(id: string) {
      return options.factories.get(id)?.();
    },
    async usableModels(operation?: string) {
      return structuredClone(
        (await availableRows(operation))
          .filter(({ available }) => available)
          .map(({ row }) => row),
      );
    },
    async catalogue(operation?: string): Promise<CatalogueModel[]> {
      return (await availableRows(operation))
        .filter(({ row }) => row.kind === 'music')
        .map(({ row, available }) =>
          catalogueModelSchema.parse({
            id: row.id,
            displayName: row.display_name,
            qualityRank: row.quality_rank,
            capabilities: row.capabilities,
            prices: Object.fromEntries(
              row.model_prices
                .filter(
                  (price) => operationSchema.safeParse(price.operation).success,
                )
                .map((price) => [price.operation, price.credits]),
            ),
            languages: Object.fromEntries(
              row.model_languages.map((language) => [
                language.language,
                language.status,
              ]),
            ),
            available,
          }),
        );
    },
  };
}
