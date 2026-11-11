import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';
// Keep local credentials in child process environment, never in logs or files.
const status = JSON.parse(
  execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
);
const env = {
  ...process.env,
  APP_ENV: 'ci',
  PROVIDER_MODE: 'mock',
  SUPABASE_URL: status.API_URL,
  SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  NEXT_PUBLIC_API_URL: 'http://localhost:4000',
  WEB_ORIGINS: 'http://localhost:3000',
  API_PORT: '4000',
};
const build = spawnSync(
  'pnpm',
  [
    '--filter',
    '@songsmith/frontend^...',
    '--filter',
    '@songsmith/backend...',
    'build',
  ],
  { env, stdio: 'inherit' },
);
if (build.status !== 0) process.exit(build.status ?? 1);
const result = spawnSync(
  'pnpm',
  ['--filter', '@songsmith/frontend', 'e2e', ...process.argv.slice(2)],
  { env, stdio: 'inherit' },
);
process.exit(result.status ?? 1);
