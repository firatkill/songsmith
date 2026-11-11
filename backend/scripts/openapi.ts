import { writeFile } from 'node:fs/promises';
import { Router } from 'express';
import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { createRegistry } from '../src/lib/route.js';
import { registerHealth } from '../src/routes/health.js';
import { registerFlags } from '../src/routes/flags.js';
import { createFlagCache } from '../src/lib/flags.js';
import { createLogger } from '../src/lib/log.js';
import { registerMe } from '../src/routes/me.js';
const registry = createRegistry();
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
