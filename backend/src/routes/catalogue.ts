import { z } from 'zod';
import { catalogueSchema, type CatalogueModel } from '@songsmith/schemas';
import { defineRoute, type RouteContext } from '../lib/route.js';

export function registerCatalogue(
  context: RouteContext,
  registry: () => Promise<{ catalogue: () => Promise<CatalogueModel[]> }>,
) {
  defineRoute(context, {
    method: 'get',
    path: '/catalogue',
    auth: 'public',
    request: { params: z.object({}), query: z.object({}) },
    response: { 200: catalogueSchema },
    responseHeaders: { 'Cache-Control': 'public, max-age=30' },
    description:
      'Enabled music models with capabilities, credit prices, language statuses and current availability.',
    handler: async () => {
      const models = await (await registry()).catalogue();
      models.sort(
        (a, b) =>
          b.qualityRank - a.qualityRank ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      return { status: 200, body: catalogueSchema.parse({ models }) };
    },
  });
}
