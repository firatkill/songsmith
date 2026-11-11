import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formatMessage } from '@songsmith/i18n';
import { createApp } from './app.js';
import { loadEnv } from './lib/env.js';
import { AppError } from './lib/errors.js';
import { createLogger } from './lib/log.js';
import { defineRoute } from './lib/route.js';
import { serve, testSource } from '../test/http.js';
const logs: string[] = [];
let http: Awaited<ReturnType<typeof serve>>;
beforeAll(async () => {
  http = await serve(
    createApp({
      env: loadEnv(testSource),
      logger: createLogger('info', {
        write: (s) => {
          logs.push(s);
        },
      }),
      registerRoutes: (context) => {
        context.router.get('/app-error', () => {
          throw new AppError('CONFLICT', { field: 'title' });
        });
        context.router.get('/zod-error', () => {
          z.object({ name: z.string() }).parse({ name: 12 });
        });
        context.router.get('/unknown', () => {
          throw new Error('sensitive error message');
        });
        defineRoute(context, {
          method: 'post',
          path: '/echo/:id',
          auth: 'optional',
          request: {
            params: z.object({ id: z.uuid() }),
            query: z.object({ count: z.coerce.number().int() }),
            body: z.object({ name: z.string() }),
          },
          response: { 200: z.object({ name: z.string(), count: z.number() }) },
          handler: ({ body, query }) => ({
            status: 200 as const,
            body: { name: body.name, count: query.count },
          }),
        });
        defineRoute(context, {
          method: 'get',
          path: '/invalid-output',
          auth: 'public',
          request: { params: z.object({}), query: z.object({}) },
          response: { 200: z.object({ name: z.string().min(4) }) },
          handler: () => ({ status: 200 as const, body: { name: 'x' } }),
        });
      },
    }),
  );
});
afterAll(async () => {
  await http.close();
});
describe('UT-04 errors', () => {
  it.each([
    { path: '/missing', status: 404, code: 'NOT_FOUND' },
    { path: '/missing', status: 400, code: 'VALIDATION', body: '{invalid' },
    {
      path: '/missing',
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      body: JSON.stringify({ text: 'x'.repeat(256 * 1024) }),
    },
    { path: '/app-error', status: 409, code: 'CONFLICT' },
    { path: '/zod-error', status: 400, code: 'VALIDATION' },
    { path: '/unknown', status: 500, code: 'INTERNAL' },
    { path: '/health', status: 200, code: null },
  ])(
    'records $status / $code on the completion log',
    async ({ path, status, code, body }) => {
      const correlationId = `completion-${String(status)}-${code ?? 'ok'}${path.replaceAll('/', '-')}`;
      const response = await fetch(`${http.url}/v1${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'x-correlation-id': correlationId,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body }),
      });
      expect(response.status).toBe(status);
      await response.text();
      const completed = logs
        .map((line): unknown => JSON.parse(line))
        .filter(
          (record) =>
            typeof record === 'object' &&
            record !== null &&
            'msg' in record &&
            record.msg === 'Request completed' &&
            'correlationId' in record &&
            record.correlationId === correlationId,
        );
      expect(completed).toHaveLength(1);
      expect(completed[0]).toMatchObject({
        status,
        errorCode: code,
        correlationId,
      });
    },
  );

  it.each(['en', 'tr'] as const)('localizes AppError in %s', async (locale) => {
    const response = await fetch(`${http.url}/v1/app-error`, {
      headers: { 'Accept-Language': locale },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: 'CONFLICT',
        message: formatMessage(locale, 'errors.CONFLICT'),
        details: { field: 'title' },
      },
    });
  });
  it('maps Zod field paths without values', async () => {
    const response = await fetch(`${http.url}/v1/zod-error`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'VALIDATION',
        message: formatMessage('en', 'errors.VALIDATION'),
        details: { fields: ['name'] },
      },
    });
  });
  it('hides unknown errors and logs only stack frames', async () => {
    const response = await fetch(`${http.url}/v1/unknown`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: 'INTERNAL',
        message: formatMessage('en', 'errors.INTERNAL'),
      },
    });
    expect(logs.join('')).not.toContain('sensitive error message');
    expect(logs.join('')).toContain('stack');
  });
});
describe('defineRoute', () => {
  it('infers and parses params, query, body and response', async () => {
    const response = await fetch(
      `${http.url}/v1/echo/550e8400-e29b-41d4-a716-446655440000?count=3`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 'test', count: 3 });
  });
  it.each([
    '/echo/bad?count=3',
    '/echo/550e8400-e29b-41d4-a716-446655440000?count=no',
    '/echo/550e8400-e29b-41d4-a716-446655440000?count=3',
  ])('rejects invalid input %s', async (path) => {
    const response = await fetch(`${http.url}/v1${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(400);
  });
  it('maps invalid handler output to INTERNAL', async () => {
    const response = await fetch(`${http.url}/v1/invalid-output`);
    expect(response.status).toBe(500);
  });
});
describe('correlation and CORS', () => {
  it.each(['550e8400-e29b-41d4-a716-446655440000', 'safe-token_123'])(
    'echoes valid ID %s',
    async (id) => {
      const response = await fetch(`${http.url}/v1/health`, {
        headers: { 'x-correlation-id': id },
      });
      expect(response.headers.get('x-correlation-id')).toBe(id);
    },
  );
  it.each(['unsafe token', 'x'.repeat(65), ''])(
    'replaces unsafe ID',
    async (id) => {
      const response = await fetch(`${http.url}/v1/health`, {
        headers: { 'x-correlation-id': id },
      });
      expect(response.headers.get('x-correlation-id')).toMatch(
        /^[a-f0-9-]{36}$/,
      );
    },
  );
  it('keeps concurrent correlation contexts isolated', async () => {
    await Promise.all(
      ['parallel-a', 'parallel-b'].map((id) =>
        fetch(`${http.url}/v1/health?email=private-query`, {
          headers: { 'x-correlation-id': id },
        }),
      ),
    );
    for (const id of ['parallel-a', 'parallel-b'])
      expect(logs.some((line) => line.includes(id))).toBe(true);
    expect(logs.join('')).not.toContain('private-query');
  });
  it('allows mobile without Origin', async () => {
    expect((await fetch(`${http.url}/v1/health`)).status).toBe(200);
  });
  it('allows configured origin and exposes correlation', async () => {
    const r = await fetch(`${http.url}/v1/health`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(r.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:3000',
    );
    expect(r.headers.get('access-control-expose-headers')).toContain(
      'x-correlation-id',
    );
  });
  it('rejects another origin', async () => {
    const r = await fetch(`${http.url}/v1/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(r.status).toBe(403);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('handles preflight', async () => {
    const r = await fetch(`${http.url}/v1/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(r.status).toBe(204);
  });
});
