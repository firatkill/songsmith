import { setTimeout, clearTimeout } from 'node:timers';
import process from 'node:process';
import console from 'node:console';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
let status;
try {
  status = JSON.parse(
    execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
} catch {
  console.error(
    'Supabase is not running. Run pnpm db:start first; dev never starts or resets Supabase.',
  );
  process.exit(1);
}
const configured = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== ''),
);
const polling = configured.SONGSMITH_DEV_POLLING === '1';
const env = {
  ...configured,
  ...(polling
    ? {
        WATCHPACK_POLLING: '1000',
        CHOKIDAR_USEPOLLING: '1',
        CHOKIDAR_INTERVAL: '1000',
      }
    : {}),
  APP_ENV: configured.APP_ENV ?? 'local',
  PROVIDER_MODE: configured.PROVIDER_MODE ?? 'mock',
  SUPABASE_URL: status.API_URL,
  SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  NEXT_PUBLIC_API_URL:
    configured.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
};
const children = new Set();
let stopping = false;
let timer;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {
      /* Already exited. */
    }
  }
  timer = setTimeout(() => {
    for (const child of children) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* Already exited. */
      }
    }
  }, 10000);
  timer.unref();
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
function run(label, args) {
  return new Promise((resolve) => {
    const child = spawn('pnpm', args, {
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.add(child);
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on('line', (line) =>
        console.log(`[${label}] ${line}`),
      );
    }
    child.on('error', () => {
      console.error(`[${label}] Could not start process`);
      stop(1);
      resolve(1);
    });
    child.on('exit', (code) => {
      children.delete(child);
      if (!children.size) clearTimeout(timer);
      resolve(code ?? 0);
    });
  });
}
if ((await run('redis', ['redis:up'])) !== 0) process.exit(1);
if (stopping) process.exit();
if (
  (await run('build', [
    '--filter',
    '@songsmith/backend^...',
    '--filter',
    '@songsmith/frontend^...',
    'build',
  ])) !== 0
)
  process.exit(1);
if (!stopping) {
  await Promise.all(
    [
      ['api', ['--filter', '@songsmith/backend', 'dev']],
      ['worker', ['--filter', '@songsmith/backend', 'dev:worker']],
      [
        'web',
        [
          '--filter',
          '@songsmith/frontend',
          'dev',
          ...(polling ? ['--webpack'] : []),
        ],
      ],
    ].map(async ([label, args]) => {
      const code = await run(label, args);
      if (!stopping) stop(code || 1);
    }),
  );
}
