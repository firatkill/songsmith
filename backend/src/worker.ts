import { createNotify, createDeliverNotification } from './notify/index.js';
import { recoverNotifications } from './notify/recovery.js';
import { MockPushSender, ExpoPushSender } from './notify/push.js';
import { SmtpSender, ResendSender } from './notify/email.js';
import { enqueue } from './jobs/enqueue.js';
import { createFlags } from './lib/flags.js';
import { cleanupRateLimits } from './lib/rate-limit.js';
import { loadEnv } from './lib/env.js';
import { createLogger } from './lib/log.js';
import { lazyServiceClient } from './db/client.js';
import { queueDefinitions, createQueues } from './jobs/queues.js';
import { ProcessorRegistry, startWorkers } from './jobs/runtime.js';
import { sweepJobs } from './jobs/sweeper.js';
import { createRegistry } from './models/registry.js';
import { createGenerateSong } from './songs/generate.js';
const env = loadEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
const service = lazyServiceClient(env);
const flags = createFlags(service, logger);
const definitions = await queueDefinitions(service, flags);
const queues = createQueues(definitions, env.REDIS_URL, logger);
const models = createRegistry(service, env, flags, logger);
const enqueueNotification = async (id: string) => {
  const queue = queues.queues.get('notify');
  if (!queue) throw new Error('Notification queue unavailable');
  await enqueue(queue, 'deliver', { jobId: id }, { jobId: id });
};
const notify = createNotify(service, enqueueNotification);
const deliverNotification = createDeliverNotification({
  service,
  logger,
  webUrl: env.PUBLIC_WEB_URL,
  push: env.EXPO_ACCESS_TOKEN
    ? new ExpoPushSender(env.EXPO_ACCESS_TOKEN)
    : new MockPushSender(),
  email: env.RESEND_API_KEY
    ? new ResendSender(env.RESEND_API_KEY, env.EMAIL_FROM)
    : new SmtpSender(env),
});
const generateSong = createGenerateSong({
  notify,
  service,
  models: () => models,
  logger,
});
const registry = new ProcessorRegistry()
  .register('notify', 'deliver', (job) => deliverNotification(job.data.jobId))
  .register('maintenance', 'sweeper', async () => {
    await sweepJobs(service, queues.queues);
    await recoverNotifications(service, queues.queues, logger);
  })
  .register('maintenance', 'nightly', () => {
    logger.info('Nightly rate-limit cleanup');
    return cleanupRateLimits(service);
  });
// One generate processor per music queue (TRD §9.3).
for (const { name } of definitions.filter((d) => d.name.startsWith('music:')))
  registry.register(name, 'generate', generateSong);
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
