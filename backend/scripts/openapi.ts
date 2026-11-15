import { writeFile } from 'node:fs/promises';
import { Router } from 'express';
import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { createRegistry } from '../src/lib/route.js';
import { registerHealth } from '../src/routes/health.js';
import { registerCatalogue } from '../src/routes/catalogue.js';
import { registerFlags } from '../src/routes/flags.js';
import { createFlagCache } from '../src/lib/flags.js';
import { createLogger } from '../src/lib/log.js';
import { registerMe } from '../src/routes/me.js';
import { registerAdmin } from '../src/routes/admin.js';
import { registerModeration } from '../src/routes/moderation.js';
import { registerLyrics } from '../src/routes/lyrics.js';
import { registerSongs } from '../src/routes/songs.js';
const registry = createRegistry();
registerModeration(
  { router: Router(), registry, production: false },
  () => {
    throw new Error('OpenAPI does not access the database');
  },
  () => Promise.reject(new Error('OpenAPI does not moderate')),
);
const offline = () => {
  throw new Error('OpenAPI does not access the database');
};
const flagCache = createFlagCache(
  () => Promise.resolve([]),
  createLogger('silent'),
);
registerLyrics(
  { router: Router(), registry, production: false },
  {
    service: offline,
    flags: flagCache,
    logger: createLogger('silent'),
    models: () => Promise.reject(new Error('OpenAPI does not load models')),
    moderate: () => Promise.reject(new Error('OpenAPI does not moderate')),
  },
);
registerSongs(
  { router: Router(), registry, production: false },
  {
    service: offline,
    flags: flagCache,
    logger: createLogger('silent'),
    models: () => Promise.reject(new Error('OpenAPI does not load models')),
    moderate: () => Promise.reject(new Error('OpenAPI does not moderate')),
    enqueue: () => Promise.reject(new Error('OpenAPI does not enqueue')),
  },
);
registerMe({ router: Router(), registry, production: false }, () => {
  throw new Error('OpenAPI does not access the database');
});
registerHealth(
  { router: Router(), registry, production: false },
  { APP_ENV: 'local', PROVIDER_MODE: 'mock' },
  '0.0.0',
);
registerFlags(
  { router: Router(), registry, production: false },
  createFlagCache(() => Promise.resolve([]), createLogger('silent')),
);
registerAdmin(
  { router: Router(), registry, production: false },
  () => {
    throw new Error('OpenAPI does not access the database');
  },
  createFlagCache(() => Promise.resolve([]), createLogger('silent')),
  () => Promise.reject(new Error('OpenAPI does not load models')),
);
registerCatalogue({ router: Router(), registry, production: false }, () =>
  Promise.reject(new Error('OpenAPI does not load models')),
);
const document = new OpenApiGeneratorV31(registry.definitions).generateDocument(
  { openapi: '3.1.0', info: { title: 'Songsmith API', version: '0.0.0' } },
);
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sorted(v)]),
    );
  return value;
}
await writeFile(
  new URL('../openapi.json', import.meta.url),
  JSON.stringify(sorted(document), null, 2) + '\n',
);
