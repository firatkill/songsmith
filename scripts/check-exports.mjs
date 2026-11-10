import console from 'node:console';
import { URL } from 'node:url';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const packages = [
  'schemas',
  'domain',
  'moderation-rules',
  'i18n',
  'ui-tokens',
  'api-client',
];
for (const name of packages) {
  // Package self-reference resolves the exports map without root runtime dependencies.
  const require = createRequire(
    new URL(`../packages/${name}/package.json`, import.meta.url),
  );
  await import(pathToFileURL(require.resolve(`@songsmith/${name}`)).href);
  console.log(`OK @songsmith/${name}`);
}
