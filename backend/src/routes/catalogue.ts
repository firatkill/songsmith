import { z } from 'zod';
import { catalogueSchema, type CatalogueModel } from '@songsmith/schemas';
import type { LyricistModel } from '../models/registry.js';
import { defineRoute, type RouteContext } from '../lib/route.js';

export function registerCatalogue(
  context: RouteContext,
  registry: () => Promise<{
    catalogue: () => Promise<CatalogueModel[]>;
    lyricist: () => Promise<LyricistModel | undefined>;
  }>,
) {
  defineRoute(context, {
    method: 'get',
    path: '/catalogue',
    auth: 'public',
    request: { params: z.object({}), query: z.object({}) },
    response: { 200: catalogueSchema },
    responseHeaders: { 'Cache-Control': 'public, max-age=30' },
    description:
      'Enabled music models with capabilities, credit prices, language statuses and current availability, plus the lyricist prices.',
    handler: async () => {
      const current = await registry();
      const [models, lyricist] = await Promise.all([
        current.catalogue(),
        current.lyricist(),
      ]);
      models.sort(
        (a, b) =>
          b.qualityRank - a.qualityRank ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      return {
        status: 200,
        body: catalogueSchema.parse({
          models,
          lyricist: lyricist
            ? {
                modelId: lyricist.modelId,
                available: lyricist.available,
                prices: lyricist.prices,
              }
            : null,
        }),
      };
    },
  });
}
