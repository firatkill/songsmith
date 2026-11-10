import { URL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

// Inline JSON in emitted ESM so Node and Metro need no JSON import attributes.
const output = new URL('../packages/i18n/dist/index.js', import.meta.url);
let code = await readFile(output, 'utf8');
for (const locale of ['en', 'tr']) {
  const json = await readFile(
    new URL(`../packages/i18n/src/${locale}.json`, import.meta.url),
    'utf8',
  );
  const statement = `import ${locale} from './${locale}.json';`;
  if (!code.includes(statement))
    throw new Error(`Missing emitted ${locale} import`);
  code = code.replace(
    statement,
    `const ${locale} = ${JSON.stringify(JSON.parse(json))};`,
  );
}
await writeFile(output, code);
