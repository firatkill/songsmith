import { createApp } from './app.js';
import { loadEnv } from './lib/env.js';
import { createLogger } from './lib/log.js';
const env = loadEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
const server = createApp({ env, logger }).listen(env.API_PORT, () => {
  logger.info(
    { port: env.API_PORT, env: env.APP_ENV, providerMode: env.PROVIDER_MODE },
    'API listening',
  );
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  logger.info('API shutting down');
  const timeout = setTimeout(() => {
    server.closeAllConnections();
    process.exitCode = 1;
  }, 10000);
  timeout.unref();
  server.close((error) => {
    clearTimeout(timeout);
    if (error) {
      logger.error({ errorCode: 'INTERNAL' }, 'Shutdown failed');
      process.exitCode = 1;
    }
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
