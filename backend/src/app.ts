import express, { Router, type RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import type { Env } from './lib/env.js';
import { createLogger, type Logger } from './lib/log.js';
import { correlation, requestContext } from './lib/correlation.js';
import { AppError, errorMiddleware } from './lib/errors.js';
import { createRegistry, type RouteContext } from './lib/route.js';
import { authStage, createJwtVerifier, profileStage } from './lib/auth.js';
import { lazyServiceClient } from './db/client.js';
import { requireStaff } from './lib/auth.js';
import { lazyBoard } from './jobs/board.js';
import { createFlags, type FlagService } from './lib/flags.js';
import { rateLimitStage } from './lib/rate-limit.js';
import { registerCatalogue } from './routes/catalogue.js';
import { registerFlags } from './routes/flags.js';
import { registerMe } from './routes/me.js';
import { registerHealth } from './routes/health.js';
import { registerAdmin } from './routes/admin.js';
import { auditMutations } from './lib/audit.js';
import { createRegistry as createModelRegistry } from './models/registry.js';
import { registerModeration } from './routes/moderation.js';
import { createModeration } from './moderation/pipeline.js';
import { registerLyrics } from './routes/lyrics.js';
import { registerSongs } from './routes/songs.js';
import { registerWallet } from './routes/wallet.js';
import { lazyProducer, type Enqueue } from './jobs/producer.js';
export interface AppDeps {
  env: Env;
  logger?: Logger;
  version?: string;
  flags?: FlagService;
  registerRoutes?: (context: RouteContext) => void;
  registerWebhooks?: (router: Router) => void;
  /** Tests inject queues with a short backoff; default: lazy Redis queues. */
  enqueue?: Enqueue;
}
export function createApp(deps: AppDeps) {
  const app = express();
  const authRoutes = Router();
  const service = lazyServiceClient(deps.env);
  const logger = deps.logger ?? createLogger(deps.env.LOG_LEVEL);
  const flags = deps.flags ?? createFlags(service, logger);
  app.disable('x-powered-by');
  app.set('trust proxy', deps.env.TRUST_PROXY_HOPS);
  // Parser errors are deferred so correlation/security/CORS still run in order.
  const parserErrors = new WeakMap<express.Request, unknown>();
  const defer =
    (parser: RequestHandler): RequestHandler =>
    (req, res, next) => {
      parser(req, res, (error?: unknown) => {
        if (error) parserErrors.set(req, error);
        next();
      });
    };
  const isWebhook = (path: string) =>
    path === '/v1/webhooks' || path.startsWith('/v1/webhooks/');
  app.use(
    '/v1/webhooks',
    defer(express.raw({ type: () => true, limit: '256kb', inflate: false })),
  );
  const json = defer(express.json({ limit: '256kb' }));
  app.use((req, res, next) => {
    if (isWebhook(req.path)) next();
    else json(req, res, next);
  });
  app.use(correlation);
  app.use((req, res, next) => {
    const start = performance.now();
    const correlationId = requestContext.getStore()?.correlationId;
    res.on('finish', () => {
      const matched: unknown = req.route;
      const route =
        matched &&
        typeof matched === 'object' &&
        'path' in matched &&
        typeof matched.path === 'string'
          ? `${req.baseUrl}${matched.path}`
          : 'unmatched';
      logger.info(
        {
          method: req.method,
          route,
          status: res.statusCode,
          latencyMs: performance.now() - start,
          correlationId,
          errorCode: (res.locals['errorCode'] as unknown) ?? null,
        },
        'Request completed',
      );
    });
    next();
  });
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        callback(
          origin === undefined || deps.env.WEB_ORIGINS.includes(origin)
            ? null
            : new AppError('FORBIDDEN'),
          true,
        );
      },
      exposedHeaders: ['x-correlation-id', 'Retry-After'],
    }),
  );
  app.use('/v1', authRoutes);
  app.use(authStage(createJwtVerifier(deps.env.SUPABASE_JWT_ISSUER)));
  app.use(profileStage(service));
  app.use(rateLimitStage(service, flags, deps.env.SUPABASE_SERVICE_ROLE_KEY));
  app.use((req, _res, next) => {
    next(parserErrors.get(req));
  });
  const webhooks = Router();
  deps.registerWebhooks?.(webhooks);
  app.use('/v1/webhooks', webhooks);
  const router = Router();
  const context = {
    router,
    authRoutes,
    registry: createRegistry(),
    production: deps.env.APP_ENV === 'production',
  };
  registerHealth(context, deps.env, deps.version ?? '0.0.0');
  registerMe(context, service);
  registerFlags(context, flags);
  // The server initializes this before listening; tests may initialize on first use.
  let models: ReturnType<typeof createModelRegistry> | undefined;
  const modelRegistry = () => {
    models ??= createModelRegistry(service, deps.env, flags, logger).catch(
      (error: unknown) => {
        models = undefined;
        throw error;
      },
    );
    return models;
  };
  app.locals['initializeModels'] = modelRegistry;
  registerAdmin(context, service, flags, modelRegistry);
  registerCatalogue(context, modelRegistry);
  const moderate = createModeration({
    service,
    flags,
    logger,
    models: modelRegistry,
  });
  registerModeration(context, service, moderate);
  registerLyrics(context, {
    service,
    flags,
    logger,
    models: modelRegistry,
    moderate,
  });
  const producer = lazyProducer(service, deps.env, logger, flags);
  registerSongs(context, {
    service,
    flags,
    models: modelRegistry,
    moderate,
    enqueue: deps.enqueue ?? producer.enqueue,
    logger,
  });
  registerWallet(context, service);
  deps.registerRoutes?.(context);
  const board = lazyBoard(service, deps.env, logger, flags);
  app.locals['closeQueues'] = () =>
    Promise.all([board.close(), producer.close()]).then(() => undefined);
  // One guard for every admin path, Bull Board included (SEC-10).
  app.use('/v1/admin', requireStaff(service, deps.env.SUPABASE_JWT_ISSUER));
  app.use(
    '/v1/admin/queues',
    auditMutations(service, 'queues', logger),
    board.handler,
  );
  app.use('/v1', router);
  app.use((_req, _res, next) => {
    next(new AppError('NOT_FOUND'));
  });
  app.use(errorMiddleware(logger));
  return app;
}
