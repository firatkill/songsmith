import process from 'node:process';
import console from 'node:console';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { join } from 'node:path';
import { command } from './mobile-devices.mjs';
import { nativeEnvironment } from './dev-common.mjs';
import {
  checkMockEnv,
  checkXcode,
  minimumXcode,
  classifyPort,
  versionAtLeast,
} from './dev-check-pure.mjs';
const env = nativeEnvironment();
const rows = [];
async function check(name, fix, test, warning = false) {
  try {
    const detail = await test();
    rows.push({
      item: name,
      status: 'PASS',
      detail: typeof detail === 'string' ? detail : 'OK',
    });
  } catch {
    rows.push({ item: name, status: warning ? 'WARN' : 'FAIL', detail: fix });
  }
}
function requireTrue(value) {
  if (!value) throw new Error('Check failed');
}
await check('Node', 'Use Node 24 from .nvmrc (minimum 22).', () =>
  requireTrue(versionAtLeast(process.version, [22, 0, 0])),
);
await check('pnpm', 'corepack prepare pnpm@10.18.3 --activate', async () =>
  requireTrue((await command('pnpm', ['--version'], env)) === '10.18.3'),
);
await check('Docker', 'Start Docker Desktop.', () =>
  command('docker', ['info', '--format', '{{.ServerVersion}}'], env),
);
let containers = '';
try {
  containers = await command(
    'docker',
    ['ps', '--format', '{{.Names}} {{.Ports}}'],
    env,
  );
} catch {
  /* Docker row reports failure. */
}
for (const port of [3000, 4000, 6379, 8081, 54321, 54322, 54323, 54324]) {
  await check(
    `Port ${port}`,
    `Stop the unrelated listener on ${port}, then rerun pnpm dev:check.`,
    async () => {
      let output;
      try {
        output = await command(
          'lsof',
          ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpct'],
          env,
        );
      } catch (error) {
        if (error.code === 1) return 'free';
        throw error;
      }
      const listeners = [];
      let current;
      for (const line of output.split('\n')) {
        if (line.startsWith('p')) {
          current = { pid: Number(line.slice(1)), command: '' };
          listeners.push(current);
        }
        if (line.startsWith('c') && current) current.command = line.slice(1);
      }
      const ownPids = [];
      for (const listener of listeners) {
        try {
          const cwd = await command(
            'lsof',
            ['-a', '-p', String(listener.pid), '-d', 'cwd', '-Fn'],
            env,
          );
          if (
            cwd
              .split('\n')
              .some(
                (line) =>
                  line === `n${process.cwd()}` ||
                  line.startsWith(`n${process.cwd()}/`),
              )
          )
            ownPids.push(listener.pid);
        } catch {
          /* Unknown ownership is a conflict. */
        }
      }
      const ownContainer = containers
        .split('\n')
        .some(
          (line) =>
            /^(supabase_\w+_songsmith|docker-redis-1) /.test(line) &&
            line.includes(`:${port}->`),
        );
      const classification = classifyPort(listeners, ownPids, ownContainer);
      requireTrue(classification !== 'conflict');
      return classification;
    },
  );
}
await check(
  'Xcode',
  'sudo xcode-select -s /Applications/Xcode.app/Contents/Developer',
  async () =>
    requireTrue(
      (await command('xcode-select', ['-p'], env)).includes('Xcode.app'),
    ),
);
let xcode = { installed: 'unknown', required: minimumXcode, supported: false };
try {
  xcode = checkXcode(await command('xcodebuild', ['-version'], env));
} catch {
  /* Report missing version below. */
}
await check(
  'Xcode version',
  `Installed ${xcode.installed}; Expo SDK 58 requires Xcode ${xcode.required}+. Update Xcode and select it with xcode-select.`,
  () => {
    requireTrue(xcode.supported);
    return `Installed ${xcode.installed}; required ${xcode.required}+`;
  },
);
await check('CocoaPods', 'brew install cocoapods', () =>
  command('pod', ['--version'], env),
);
await check(
  'Watchman',
  'brew install watchman',
  () => command('watchman', ['--version'], env),
  true,
);
await check(
  'iOS runtime',
  'Install an iOS runtime in Xcode Settings → Platforms.',
  async () => {
    const data = JSON.parse(
      await command('xcrun', ['simctl', 'list', 'runtimes', '-j'], env),
    );
    requireTrue(
      data.runtimes.some(
        (runtime) => runtime.isAvailable && runtime.name.startsWith('iOS'),
      ),
    );
  },
);
await check(
  'iPhone simulator',
  'Create iPhone 17 in Xcode Devices and Simulators.',
  async () => {
    const data = JSON.parse(
      await command(
        'xcrun',
        ['simctl', 'list', 'devices', 'available', '-j'],
        env,
      ),
    );
    requireTrue(
      Object.values(data.devices)
        .flat()
        .some(
          (device) =>
            device.name === (env.SONGSMITH_IOS_SIMULATOR || 'iPhone 17'),
        ),
    );
  },
);
const adb = join(env.ANDROID_HOME, 'platform-tools/adb');
await check(
  'Android adb',
  'Install Android SDK Platform Tools; set ANDROID_HOME.',
  () => command(adb, ['version'], env).then(() => 'present'),
);
await check(
  'Android AVD',
  'Install Emulator + ARM64 system image and create an AVD in Android Studio.',
  async () => {
    const avds = (
      await command(
        join(env.ANDROID_HOME, 'emulator/emulator'),
        ['-list-avds'],
        env,
      )
    )
      .split('\n')
      .filter(Boolean);
    requireTrue(
      env.SONGSMITH_ANDROID_AVD
        ? avds.includes(env.SONGSMITH_ANDROID_AVD)
        : avds.length > 0,
    );
  },
);
await check(
  'Java',
  'Set JAVA_HOME to Android Studio.app/Contents/jbr/Contents/Home (JBR 21).',
  async () => {
    // java writes version to stderr; use the properties command through execFile directly.
    const { execFileSync } = await import('node:child_process');
    const version = execFileSync(
      join(env.JAVA_HOME || '', 'bin/java'),
      ['-version'],
      { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return version || 'present';
  },
);
await check(
  '.env.local mock mode',
  'Copy .env.example to .env.local; use APP_ENV=local, PROVIDER_MODE=mock and default ports. Credentials are injected by dev scripts.',
  () => {
    requireTrue(existsSync('.env.local'));
    const failures = checkMockEnv(parseEnv(readFileSync('.env.local', 'utf8')));
    if (failures.length) {
      rows.push({
        item: 'Environment names',
        status: 'FAIL',
        detail: failures.join(', '),
      });
      throw new Error('Invalid names');
    }
    return 'complete for mock mode (Supabase credentials injected at launch)';
  },
);
await check(
  'iOS development build',
  'Boot the simulator; run pnpm mobile:build:ios.',
  () =>
    command(
      'xcrun',
      ['simctl', 'get_app_container', 'booted', 'com.songsmith.app.dev'],
      env,
    ).then(() => 'installed'),
  true,
);
await check(
  'Android development build',
  'Boot the AVD; run pnpm mobile:build:android.',
  async () =>
    requireTrue(
      (
        await command(
          adb,
          ['shell', 'pm', 'path', 'com.songsmith.app.dev'],
          env,
        )
      ).startsWith('package:'),
    ),
  true,
);
await check(
  'Maestro',
  'curl -Ls "https://get.maestro.mobile.dev" | bash; add ~/.maestro/bin to PATH.',
  () => command('maestro', ['--version'], env),
  true,
);
console.table(rows);
process.exitCode = rows.some((row) => row.status === 'FAIL') ? 1 : 0;
