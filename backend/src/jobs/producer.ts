import type { FlagService } from '../lib/flags.js';
import type { Service } from '../lib/auth.js';
import type { Env } from '../lib/env.js';
import type { Logger } from '../lib/log.js';
import { enqueue } from './enqueue.js';
import { createQueues, queueDefinitions } from './queues.js';
export type Enqueue = (
  queue: string,
  name: string,
  data: { jobId: string; correlationId: string },
) => Promise<void>;
// The API only enqueues (TRD §9.1). Queues are created on first use so the API
// starts without Redis; the sweeper re-enqueues a job whose enqueue failed.
export function lazyProducer(
  service: Service,
  env: Pick<Env, 'REDIS_URL'>,
  logger: Logger,
  flags: FlagService,
) {
  let resources: Promise<ReturnType<typeof createQueues>> | undefined;
  const get = () => {
    resources ??= queueDefinitions(service, flags)
      .then((definitions) => createQueues(definitions, env.REDIS_URL, logger))
      .catch((error: unknown) => {
        resources = undefined;
        throw error;
      });
    return resources;
  };
  const producer: Enqueue = async (queue, name, data) => {
    const target = (await get()).queues.get(queue);
    if (!target) throw new Error('Queue unavailable');
    await enqueue(target, name, data, { jobId: data.jobId });
  };
  return {
    enqueue: producer,
    async close() {
      if (resources) await (await resources.catch(() => undefined))?.close();
    },
  };
}
