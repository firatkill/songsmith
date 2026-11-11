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
import { registerMe } from './routes/me.js';
import { registerHealth } from './routes/health.js';
export interface AppDeps {
  env: Env;
  logger?: Logger;
  version?: string;
  registerRoutes?: (context: RouteContext) => void;
  registerWebhooks?: (router: Router) => void;
}
export function createApp(deps: AppDeps) {
  const app = express();
  const authRoutes = Router();
  const service = lazyServiceClient(deps.env);
  const logger = deps.logger ?? createLogger(deps.env.LOG_LEVEL);
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
      exposedHeaders: ['x-correlation-id'],
    }),
  );
  app.use('/v1', authRoutes);
  app.use(authStage(createJwtVerifier(deps.env.SUPABASE_JWT_ISSUER)));
  app.use(profileStage(service));
  app.use((_req, _res, next) => {
    next();
  }); // T-09/T-25/T-43: rate limits and caps.
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
  deps.registerRoutes?.(context);
  const board = lazyBoard(service, deps.env, logger);
  app.locals['closeQueues'] = () => board.close();
  app.use(
    '/v1/admin/queues',
    requireStaff(service, deps.env.SUPABASE_JWT_ISSUER),
    board.handler,
  );
  app.use('/v1', router);
  app.use((_req, _res, next) => {
    next(new AppError('NOT_FOUND'));
  });
  app.use(errorMiddleware(logger));
  return app;
}
