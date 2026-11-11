import { createFlags } from './lib/flags.js';
import { cleanupRateLimits } from './lib/rate-limit.js';
import { loadEnv } from './lib/env.js';
import { createLogger } from './lib/log.js';
import { lazyServiceClient } from './db/client.js';
import { queueDefinitions, createQueues } from './jobs/queues.js';
import { ProcessorRegistry, startWorkers } from './jobs/runtime.js';
import { sweepJobs } from './jobs/sweeper.js';
const env = loadEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
const service = lazyServiceClient(env);
const flags = createFlags(service, logger);
const definitions = await queueDefinitions(service, flags);
const queues = createQueues(definitions, env.REDIS_URL, logger);
const registry = new ProcessorRegistry()
  .register('maintenance', 'sweeper', () => sweepJobs(service, queues.queues))
  .register('maintenance', 'nightly', () => {
    logger.info('Nightly rate-limit cleanup');
    return cleanupRateLimits(service);
  });
const runtime = await startWorkers(
  definitions,
  env.REDIS_URL,
  registry,
  logger,
  queues.queues,
).catch(async () => {
  await queues.close();
  logger.error({ errorCode: 'INTERNAL' }, 'Worker startup failed');
  process.exit(1);
});
logger.info('Worker started');
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  logger.info('Worker stopping');
  await runtime.close();
  await queues.close();
  logger.info('Worker stopped');
}
process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
