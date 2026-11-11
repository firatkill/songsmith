import { Redis } from 'ioredis';
import { Worker, UnrecoverableError, DelayedError, type Job } from 'bullmq';
import { jobDataSchema, type JobData } from '@songsmith/schemas';
import type { Logger } from '../lib/log.js';
import {
  createQueues,
  physicalQueueName,
  type QueueDefinition,
  type JobQueue,
} from './queues.js';
export type Processor = (job: Job<JobData, unknown>) => Promise<unknown>;
export class ProcessorRegistry {
  private processors = new Map<string, Processor>();
  register(queue: string, name: string, processor: Processor) {
    const key = `${queue}/${name}`;
    if (this.processors.has(key))
      throw new Error('Processor already registered');
    this.processors.set(key, processor);
    return this;
  }
  async process(queue: string, job: Job<JobData, unknown>) {
    const processor = this.processors.get(`${queue}/${job.name}`);
    if (!processor) throw new UnrecoverableError('Processor not registered');
    // Schedulers carry no application payload; all application jobs carry IDs only.
    if (queue !== 'maintenance') jobDataSchema.parse(job.data);
    try {
      return await processor(job);
    } catch (error) {
      if (error instanceof DelayedError || error instanceof UnrecoverableError)
        throw error;
      if (
        error &&
        typeof error === 'object' &&
        'retryable' in error &&
        error.retryable === false
      )
        throw new UnrecoverableError('Non-retryable job failure');
      // BullMQ stores error messages/stack traces in Redis. Do not persist raw
      // provider exceptions, which can contain input or credentials (SEC-11).
      // eslint-disable-next-line preserve-caught-error -- SEC-11: raw causes must not enter Redis.
      throw new Error('Job processing failed');
    }
  }
}
export async function registerSchedulers(queue: JobQueue) {
  await queue.upsertJobScheduler(
    'sweeper',
    { every: 300_000 },
    { name: 'sweeper' },
  );
  await queue.upsertJobScheduler(
    'nightly',
    { pattern: '0 3 * * *', tz: 'Europe/Istanbul' },
    { name: 'nightly' },
  );
}
export async function startWorkers(
  definitions: QueueDefinition[],
  url: string,
  registry: ProcessorRegistry,
  logger: Logger,
  queues: Map<string, JobQueue>,
) {
  const connection = new Redis(url, { maxRetriesPerRequest: null });
  connection.on('error', () => {
    logger.error({ errorCode: 'INTERNAL' }, 'Worker connection error');
  });
  const workers = definitions.map(({ name, concurrency, limiter }) => {
    const worker = new Worker<JobData, unknown, string>(
      physicalQueueName(name),
      (job) => registry.process(name, job),
      { connection, concurrency, ...(limiter ? { limiter } : {}) },
    );
    worker.on('error', () => {
      logger.error({ errorCode: 'INTERNAL' }, 'Worker error');
    });
    worker.on('failed', (job) => {
      logger.warn({ jobId: job?.id, errorCode: 'INTERNAL' }, 'Job failed');
    });
    return worker;
  });
  const close = async () => {
    await Promise.all(workers.map((w) => w.close()));
    connection.disconnect();
  };
  try {
    await Promise.all(workers.map((w) => w.waitUntilReady()));
    const maintenance = queues.get('maintenance');
    if (maintenance) await registerSchedulers(maintenance);
  } catch (error) {
    await close();
    throw error;
  }
  return { workers, close };
}
export { createQueues };
