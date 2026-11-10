import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import {
  boundaryConfig,
  boundaryIgnores,
} from '../packages/config/boundaries.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures = process.argv.includes('--fixtures');
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    {
      ignores: [
        ...boundaryIgnores,
        ...(fixtures ? [] : ['fixtures/boundaries/**']),
      ],
    },
    ...boundaryConfig,
  ],
});
const results = await eslint.lintFiles(
  fixtures ? ['fixtures/boundaries'] : ['.'],
);
if (process.argv.includes('--json')) console.log(JSON.stringify(results));
else {
  console.log(await (await eslint.loadFormatter('stylish')).format(results));
  console.log(
    `Boundary checks: ${String(results.reduce((sum, result) => sum + result.errorCount, 0))} errors`,
  );
}
if (results.some((result) => result.errorCount > 0)) process.exitCode = 1;
