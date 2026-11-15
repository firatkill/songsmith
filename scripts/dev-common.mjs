import { setTimeout, clearTimeout } from 'node:timers';
import process from 'node:process';
import console from 'node:console';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
export function nativeEnvironment(source = process.env) {
  const configured = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value?.trim() !== ''),
  );
  const sdk =
    configured.ANDROID_HOME ||
    configured.ANDROID_SDK_ROOT ||
    join(homedir(), 'Library/Android/sdk');
  const java =
    configured.JAVA_HOME ||
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  return {
    ...configured,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    ...(existsSync(java) ? { JAVA_HOME: java } : {}),
    PATH: [
      join(sdk, 'emulator'),
      join(sdk, 'platform-tools'),
      ...(existsSync(java) ? [join(java, 'bin')] : []),
      configured.PATH,
    ]
      .filter(Boolean)
      .join(':'),
  };
}
export function localEnvironment() {
  let status;
  try {
    status = JSON.parse(
      execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  } catch {
    throw new Error('Supabase is not running. Run pnpm db:start.');
  }
  for (const key of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY'])
    if (typeof status[key] !== 'string' || !status[key])
      throw new Error(`Supabase status is missing ${key}`);
  const configured = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value?.trim() !== ''),
  );
  return nativeEnvironment({
    ...configured,
    ...(configured.SONGSMITH_DEV_POLLING === '1'
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
    EXPO_PUBLIC_SUPABASE_URL: status.API_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  });
}
export function redactDevLine(line, env = {}) {
  let safe = line
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      '[redacted]',
    )
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, '[redacted]');
  for (const [key, value] of Object.entries(env)) {
    if (/KEY|TOKEN|SECRET|PASSWORD/.test(key) && value && value.length > 5)
      safe = safe.split(value).join('[redacted]');
  }
  if (
    /anon key|service_role key|JWT secret|Secret key|Publishable key/i.test(
      safe,
    )
  )
    return '[credentials omitted]';
  return safe;
}
export function supervisor(env) {
  const children = new Set();
  let stopping = false;
  let timer;
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const child of children) {
      try {
        process.kill(-child.pid, 'SIGTERM');
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
  function run(label, args, command = 'pnpm') {
    return new Promise((resolve) => {
      if (stopping) {
        resolve(1);
        return;
      }
      const child = spawn(command, args, {
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      children.add(child);
      for (const stream of [child.stdout, child.stderr])
        createInterface({ input: stream }).on('line', (line) =>
          console.log(`[${label}] ${redactDevLine(line, env)}`),
        );
      child.on('error', () => {
        children.delete(child);
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
  return {
    run,
    stop,
    get stopping() {
      return stopping;
    },
  };
}
export async function runStack({ all = false, mobileOnly = false } = {}) {
  if (all) {
    try {
      localEnvironment();
    } catch {
      const start = supervisor(nativeEnvironment());
      if (await start.run('supabase', ['db:start'])) return start.stop(1);
    }
  }
  let env;
  try {
    env = localEnvironment();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  const tasks = supervisor(env);
  if (!mobileOnly && (await tasks.run('redis', ['redis:up'])))
    return tasks.stop(1);
  if (
    await tasks.run('build', [
      '--filter',
      '@songsmith/backend^...',
      '--filter',
      '@songsmith/frontend^...',
      '--filter',
      '@songsmith/mobile^...',
      'build',
    ])
  )
    return tasks.stop(1);
  const commands = mobileOnly
    ? []
    : [
        ['api', ['--filter', '@songsmith/backend', 'dev']],
        ['worker', ['--filter', '@songsmith/backend', 'dev:worker']],
        [
          'web',
          [
            '--filter',
            '@songsmith/frontend',
            'dev',
            ...(env.SONGSMITH_DEV_POLLING === '1' ? ['--webpack'] : []),
          ],
        ],
      ];
  if (all || mobileOnly)
    commands.push([
      'expo',
      [
        '--filter',
        '@songsmith/mobile',
        'exec',
        'expo',
        'start',
        '--dev-client',
        '--port',
        '8081',
      ],
    ]);
  const running = commands.map(async ([label, args]) => {
    const code = await tasks.run(label, args);
    if (!tasks.stopping) tasks.stop(code || 1);
  });
  if (all) {
    const { openDevices } = await import('./mobile-devices.mjs');
    await openDevices(env, () => tasks.stopping);
  }
  await Promise.all(running);
}
