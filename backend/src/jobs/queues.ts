import { Queue, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import {
  queueCatalogueSchema,
  isFlagKey,
  queueLimiterSchema,
  type JobData,
} from '@songsmith/schemas';
import { createFlags, type FlagService } from '../lib/flags.js';
import { createLogger } from '../lib/log.js';
import type { Service } from '../lib/auth.js';
import type { Logger } from '../lib/log.js';
export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: { age: 86400 },
  removeOnFail: { age: 7 * 86400 },
};
export interface QueueDefinition {
  name: string;
  concurrency: number;
  limiter?: { max: number; duration: number };
}
// BullMQ forbids ':' in queue names. Logical music:<adapter> maps bijectively
// to music-<adapter>; all callers and the registry use the logical name.
export function physicalQueueName(name: string) {
  return name.replace(/^music:/, 'music-');
}
export async function queueDefinitions(
  service: Service,
  flags: FlagService = createFlags(service, createLogger()),
): Promise<QueueDefinition[]> {
  const [models, values] = await Promise.all([
    service().from('models').select('id,adapter').eq('kind', 'music'),
    flags.getFlags(),
  ]);
  if (models.error) throw new Error('Queue configuration unavailable');
  const concurrency = values.music_queue_concurrency;
  return [
    ...[
      ...new Set(queueCatalogueSchema.parse(models.data).map((m) => m.adapter)),
    ].map((provider) => {
      const key = `music_queue_limiter:${provider}`;
      const value = isFlagKey(key) ? values[key] : null;
      return {
        name: `music:${provider}`,
        concurrency,
        ...(value === null ? {} : { limiter: queueLimiterSchema.parse(value) }),
      };
    }),
    { name: 'media', concurrency: 4 },
    { name: 'video', concurrency: 1 },
    { name: 'account', concurrency: 2 },
    { name: 'maintenance', concurrency: 1 },
  ];
}
export function createQueues(
  definitions: QueueDefinition[],
  url: string,
  logger: Logger,
) {
  const connection = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  connection.on('error', () => {
    logger.error({ errorCode: 'INTERNAL' }, 'Queue connection error');
  });
  const queues = new Map(
    definitions.map(({ name }) => {
      const queue = new Queue<JobData, unknown, string>(
        physicalQueueName(name),
        { connection, defaultJobOptions },
      );
      queue.on('error', () => {
        logger.error({ errorCode: 'INTERNAL' }, 'Queue error');
      });
      return [name, queue] as const;
    }),
  );
  return {
    queues,
    async close() {
      await Promise.all([...queues.values()].map((q) => q.close()));
      connection.disconnect();
    },
  };
}
export type JobQueue = Queue<JobData, unknown>;
