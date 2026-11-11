import createClient from 'openapi-fetch';
import type { paths } from './generated/schema.js';
export type { paths, components } from './generated/schema.js';
export function createApiClient(options: {
  baseUrl: string;
  getAccessToken?: () => string | undefined | Promise<string | undefined>;
  locale?: string;
}) {
  const client = createClient<paths>({ baseUrl: options.baseUrl });
  client.use({
    async onRequest({ request }) {
      const token = await options.getAccessToken?.();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      request.headers.set('Accept-Language', options.locale ?? 'en');
      // No Node imports; Web Crypto is optional on React Native. This ID is not a security token.
      const webCrypto = (
        globalThis as { crypto?: { randomUUID?: () => string } }
      ).crypto;
      const id =
        webCrypto?.randomUUID?.() ??
        `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      request.headers.set('x-correlation-id', id);
      return request;
    },
  });
  return client;
}
