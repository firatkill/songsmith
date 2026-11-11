import { afterEach, expect, it, vi } from 'vitest';
import { createApiClient } from './index.js';
afterEach(() => {
  vi.unstubAllGlobals();
});
it('sets async access token, locale and correlation without Node APIs', async () => {
  let received: Request | undefined;
  vi.stubGlobal('fetch', (request: Request) => {
    received = request;
    return Promise.resolve(
      Response.json({
        status: 'ok',
        version: '0.0.0',
        env: 'local',
        providerMode: 'mock',
      }),
    );
  });
  const client = createApiClient({
    baseUrl: 'https://example.test',
    getAccessToken: () => Promise.resolve('test-token'),
    locale: 'tr',
  });
  const { data } = await client.GET('/v1/health');
  expect(data?.status).toBe('ok');
  expect(received?.headers.get('Authorization')).toBe('Bearer test-token');
  expect(received?.headers.get('Accept-Language')).toBe('tr');
  expect(received?.headers.get('x-correlation-id')).toMatch(
    /^[A-Za-z0-9_-]{1,64}$/,
  );
});
it('supports public requests and a runtime without Web Crypto', async () => {
  let received: Request | undefined;
  vi.stubGlobal('crypto', undefined);
  vi.stubGlobal('fetch', (request: Request) => {
    received = request;
    return Promise.resolve(
      Response.json({
        status: 'ok',
        version: '0.0.0',
        env: 'local',
        providerMode: 'mock',
      }),
    );
  });
  await createApiClient({ baseUrl: 'https://example.test' }).GET('/v1/health');
  expect(received?.headers.has('Authorization')).toBe(false);
  expect(received?.headers.get('Accept-Language')).toBe('en');
  expect(received?.headers.get('x-correlation-id')).toMatch(/^req-/);
});
