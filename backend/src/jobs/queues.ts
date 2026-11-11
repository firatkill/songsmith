import { Queue, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import {
  queueCatalogueSchema,
  queueFlagsSchema,
  queueConcurrencySchema,
  queueLimiterSchema,
  type JobData,
} from '@songsmith/schemas';
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
): Promise<QueueDefinition[]> {
  const [models, flags] = await Promise.all([
    service().from('models').select('id,adapter').eq('kind', 'music'),
    service()
      .schema('app')
      .from('flags')
      .select('key,value')
      .like('key', 'music_queue_%'),
  ]);
  if (models.error || flags.error)
    throw new Error('Queue configuration unavailable');
  const values = new Map(
    queueFlagsSchema.parse(flags.data).map((row) => [row.key, row.value]),
  );
  const concurrency = queueConcurrencySchema.parse(
    values.get('music_queue_concurrency') ?? 4,
  );
  return [
    ...[
      ...new Set(queueCatalogueSchema.parse(models.data).map((m) => m.adapter)),
    ].map((provider) => {
      const value = values.get(`music_queue_limiter:${provider}`);
      return {
        name: `music:${provider}`,
        concurrency,
        ...(value === undefined
          ? {}
          : { limiter: queueLimiterSchema.parse(value) }),
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
