import process from 'node:process';
import { devClientUrl } from './mobile-launch.mjs';
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { nativeEnvironment } from './dev-common.mjs';
const platform = process.argv[2] || 'android';
if (!['ios', 'android'].includes(platform))
  throw new Error('Usage: pnpm e2e:mobile [android|ios]');
const result = spawnSync(
  'maestro',
  [
    '--platform',
    platform,
    'test',
    'mobile/.maestro',
    '-e',
    `DEV_URL=${devClientUrl(platform)}`,
    ...process.argv.slice(3),
  ],
  {
    stdio: 'inherit',
    env: {
      ...nativeEnvironment(),
      MAESTRO_CLI_NO_ANALYTICS: '1',
      MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
    },
  },
);
if (result.error)
  console.error(
    'Maestro is unavailable. Install it using docs/runbooks/local-dev.md.',
  );
process.exitCode = result.status ?? 1;
