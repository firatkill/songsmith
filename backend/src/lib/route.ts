import { z } from 'zod';
import {
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import type { Router } from 'express';
import { errorResponseSchema } from '@songsmith/schemas';
import { requestContext } from './correlation.js';
import { AppError } from './errors.js';
extendZodWithOpenApi(z);
export function createRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();
  // Native Zod conversion preserves recursive JSON details; the OpenAPI adapter
  // otherwise recurses indefinitely. Rebase local JSON Schema references.
  type Component = Parameters<typeof registry.registerComponent<'schemas'>>[2];
  const converted = z.toJSONSchema(errorResponseSchema, {
    override: ({ zodSchema, jsonSchema }) => {
      if (
        zodSchema ===
        errorResponseSchema.shape.error.shape.details.unwrap().valueType
      ) {
        // An empty JSON Schema accepts every JSON value, exactly z.json() on
        // the wire. Avoid recursive indexed aliases in generated TypeScript.
        for (const key of Object.keys(jsonSchema))
          Reflect.deleteProperty(jsonSchema, key);
      }
    },
  });
  // Lift $defs to components so generated clients do not treat $defs as data.
  const { $defs, ...root } = converted;
  const rebase = (schema: unknown): Component =>
    JSON.parse(
      JSON.stringify(schema).replaceAll(
        '#/$defs/',
        '#/components/schemas/ErrorResponse_',
      ),
    ) as Component;
  for (const [name, schema] of Object.entries($defs ?? {})) {
    registry.registerComponent(
      'schemas',
      `ErrorResponse_${name}`,
      rebase(schema),
    );
  }
  registry.registerComponent('schemas', 'ErrorResponse', rebase(root));
  return registry;
}
type Responses = Record<number, z.ZodType>;
type Result<R extends Responses> = {
  [S in keyof R]: { status: S; body: z.output<R[S]> };
}[keyof R];
export interface RouteContext {
  router: Router;
  registry: OpenAPIRegistry;
  production: boolean;
  authRoutes?: Router;
}
export function defineRoute<
  P extends z.ZodObject,
  Q extends z.ZodObject,
  B extends z.ZodType,
  const R extends Responses,
>(
  context: RouteContext,
  definition: {
    method: 'get' | 'post' | 'put' | 'patch' | 'delete';
    path: string;
    auth: 'public' | 'optional' | 'required';
    description?: string;
    request: { params: P; query: Q; body?: B };
    response: R;
    handler: (input: {
      params: z.output<P>;
      query: z.output<Q>;
      body: z.output<B>;
    }) => Result<R> | Promise<Result<R>>;
  },
) {
  const responses = Object.fromEntries(
    Object.entries(definition.response).map(([status, schema]) => [
      status,
      {
        description: `HTTP ${status}`,
        content: { 'application/json': { schema } },
      },
    ]),
  );
  context.registry.registerPath({
    method: definition.method,
    path: `/v1${definition.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`,
    'x-auth-mode': definition.auth,
    ...(definition.description ? { description: definition.description } : {}),
    request: {
      params: definition.request.params,
      query: definition.request.query,
      ...(definition.request.body
        ? {
            body: {
              content: {
                'application/json': { schema: definition.request.body },
              },
            },
          }
        : {}),
    },
    responses: {
      ...responses,
      default: {
        description: 'API error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });
  context.authRoutes?.[definition.method](
    definition.path,
    (_req, _res, next) => {
      const store = requestContext.getStore();
      if (store) {
        store.authMode = definition.auth;
        store.ageGateAllowed =
          (definition.method === 'get' && definition.path === '/me') ||
          (definition.method === 'post' && definition.path === '/me/age');
      }
      next('router');
    },
  );
  context.router[definition.method](definition.path, async (req, res) => {
    const input = {
      params: definition.request.params.parse(req.params),
      query: definition.request.query.parse(req.query),
      body: definition.request.body?.parse(req.body) as z.output<B>,
    };
    const result = await definition.handler(input);
    const schema = definition.response[Number(result.status)];
    if (
      !context.production &&
      (!schema || !schema.safeParse(result.body).success)
    )
      throw new AppError('INTERNAL');
    res.status(Number(result.status)).json(result.body);
  });
}
