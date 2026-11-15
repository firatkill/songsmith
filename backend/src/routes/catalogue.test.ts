import { describe, expect, it, vi } from 'vitest';
import { catalogueSchema } from '@songsmith/schemas';
import { createApp } from '../app.js';
import { loadEnv } from '../lib/env.js';
import { createLogger } from '../lib/log.js';
import { capabilities } from '../providers/mock/music.js';
import { serve, testSource } from '../../test/http.js';

const { catalogue } = vi.hoisted(() => ({ catalogue: vi.fn() }));
vi.mock('../models/registry.js', () => ({
  createRegistry: () =>
    Promise.resolve({
      catalogue,
      usableModels: () => Promise.resolve([]),
      invalidate: () => {},
    }),
}));

describe('GET /v1/catalogue', () => {
  it('is public, schema-valid, cacheable and sorted by rank then id', async () => {
    const models = ['z', 'b', 'a'].map((id) => ({
      id,
      displayName: id,
      qualityRank: id === 'z' ? 30 : 20,
      capabilities: capabilities('a'),
      prices: { generate: 10 },
      languages: { en: 'verified' },
      available: id !== 'b',
    }));
    catalogue.mockResolvedValue(models.reverse());
    const app = createApp({
      env: loadEnv(testSource),
      logger: createLogger('silent'),
    });
    const http = await serve(app);
    try {
      const response = await fetch(`${http.url}/v1/catalogue`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('public, max-age=30');
      const body = catalogueSchema.parse(await response.json());
      expect(body.models.map(({ id }) => id)).toEqual(['z', 'a', 'b']);
      expect(body.models.find(({ id }) => id === 'b')?.available).toBe(false);
    } finally {
      await http.close();
    }
  });
});
