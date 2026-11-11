import {
  flagRegistry,
  flagRowsSchema,
  isFlagKey,
  type FlagKey,
  type Flags,
} from '@songsmith/schemas';
import type { Service } from './auth.js';
import type { Logger } from './log.js';

export const FLAG_CACHE_MS = 30_000;
const REFRESH_TIMEOUT_MS = 2000;
export function createFlags(service: Service, logger: Logger, now = Date.now) {
  return createFlagCache(
    async (signal) => {
      const result = await service()
        .schema('app')
        .from('flags')
        .select('key,value')
        .abortSignal(signal);
      if (result.error) throw new Error('Flag query failed');
      return result.data;
    },
    logger,
    now,
  );
}
// Injectable transport and clock keep expiry/timeout tests independent of wall time.
export function createFlagCache(
  load: (signal: AbortSignal) => Promise<unknown>,
  logger: Pick<Logger, 'warn' | 'error'>,
  now = Date.now,
) {
  const defaults = () =>
    Object.fromEntries(
      Object.entries(flagRegistry).map(([key, entry]) => [
        key,
        structuredClone(entry.default),
      ]),
    ) as Flags;
  let values = defaults();
  let expires = -Infinity;
  let inFlight: Promise<void> | undefined;
  async function refresh() {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Flag refresh timeout'));
        }, REFRESH_TIMEOUT_MS);
      });
      const rows = flagRowsSchema.parse(
        await Promise.race([load(controller.signal), timeout]),
      );
      const next = defaults();
      for (const row of rows) {
        if (!isFlagKey(row.key)) {
          // Never log unknown keys/values: table contents may contain private text.
          logger.warn('Unknown flag ignored');
          continue;
        }
        const result = flagRegistry[row.key].schema.safeParse(row.value);
        if (result.success) Object.assign(next, { [row.key]: result.data });
        else logger.error({ flag: row.key }, 'Invalid flag; using default');
      }
      values = next;
      expires = now() + FLAG_CACHE_MS;
    } catch {
      logger.error('Flag refresh failed; serving stale values');
      // Brief retry backoff without extending the successful cache lifetime.
      expires = now() + 1000;
    } finally {
      clearTimeout(timer);
    }
  }
  async function getFlags(): Promise<Flags> {
    if (now() >= expires) {
      inFlight ??= refresh().finally(() => {
        inFlight = undefined;
      });
      await inFlight;
    }
    return structuredClone(values);
  }
  async function getFlag<K extends FlagKey>(key: K): Promise<Flags[K]> {
    return (await getFlags())[key];
  }
  async function killSwitch({
    provider,
    operation,
  }: { provider?: string; operation?: string } = {}) {
    const flags = await getFlags();
    const keys = [
      'kill_switch:all',
      ...(provider ? [`kill_switch:provider:${provider}`] : []),
      ...(operation ? [`kill_switch:operation:${operation}`] : []),
    ];
    return keys.some((key) => isFlagKey(key) && flags[key] === true);
  }
  return { getFlag, getFlags, killSwitch };
}
export type FlagService = ReturnType<typeof createFlags>;
