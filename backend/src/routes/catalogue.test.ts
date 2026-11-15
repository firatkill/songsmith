import { describe, expect, it, vi } from 'vitest';
import { catalogueSchema } from '@songsmith/schemas';
import { createApp } from '../app.js';
import { loadEnv } from '../lib/env.js';
import { createLogger } from '../lib/log.js';
import { capabilities } from '../providers/mock/music.js';
import { serve, testSource } from '../../test/http.js';

const { catalogue, lyricist } = vi.hoisted(() => ({
  catalogue: vi.fn(),
  lyricist: vi.fn(),
}));
vi.mock('../models/registry.js', () => ({
  createRegistry: () =>
    Promise.resolve({
      catalogue,
      lyricist,
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
    lyricist.mockResolvedValue({
      modelId: 'mock-text',
      adapterId: 'mock-text',
      available: true,
      prices: { lyrics: 1, rewrite: 1 },
    });
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
      expect(body.lyricist).toEqual({
        modelId: 'mock-text',
        available: true,
        prices: { lyrics: 1, rewrite: 1 },
      });
    } finally {
      await http.close();
    }
  });
});
