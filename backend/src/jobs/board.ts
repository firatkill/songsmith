import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { RequestHandler } from 'express';
import type { FlagService } from '../lib/flags.js';
import type { Service } from '../lib/auth.js';
import type { Env } from '../lib/env.js';
import type { Logger } from '../lib/log.js';
import { createQueues, queueDefinitions } from './queues.js';
export function lazyBoard(
  service: Service,
  env: Env,
  logger: Logger,
  flags: FlagService,
) {
  let resources: ReturnType<typeof createQueues> | undefined;
  let initializing: Promise<ExpressAdapter> | undefined;
  const initialize = async () => {
    const definitions = await queueDefinitions(service, flags);
    resources = createQueues(definitions, env.REDIS_URL, logger);
    const adapter = new ExpressAdapter();
    adapter.setBasePath('/v1/admin/queues');
    createBullBoard({
      queues: [...resources.queues.values()].map((q) => new BullMQAdapter(q)),
      serverAdapter: adapter,
    });
    return adapter;
  };
  const handler: RequestHandler = async (req, res, next) => {
    initializing ??= initialize().catch((error: unknown) => {
      initializing = undefined;
      throw error;
    });
    const adapter = await initializing;
    (adapter.getRouter() as RequestHandler)(req, res, next);
  };
  return {
    handler,
    async close() {
      await initializing?.catch(() => undefined);
      await resources?.close();
    },
  };
}
