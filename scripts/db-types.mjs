import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';

// pnpm resolves the exact CLI version pinned in the root package and lockfile.
// Capture stdout so a failed generation never truncates the checked-in types.
const path = 'packages/schemas/src/db.types.ts';
const generated = execFileSync(
  'pnpm',
  [
    'exec',
    'supabase',
    'gen',
    'types',
    'typescript',
    '--local',
    '--schema',
    'public,app',
  ],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);
const formatted = await format(generated, {
  ...(await resolveConfig(path)),
  filepath: path,
});
writeFileSync(path, formatted);
