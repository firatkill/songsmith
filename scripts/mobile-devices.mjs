import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import console from 'node:console';
import { join } from 'node:path';
const exec = promisify(execFile);
const { fetch } = globalThis;
import {
  devClientUrl,
  runDeviceCommand,
  commandError,
} from './mobile-launch.mjs';
const app = 'com.songsmith.app.dev';
export async function command(file, args, env) {
  return runDeviceCommand(
    async () =>
      (
        await exec(file, args, { env, timeout: 30000, maxBuffer: 1024 * 1024 })
      ).stdout.trim(),
    args,
  );
}
async function waitFor(check, stopped, attempts = 60) {
  let lastError;
  for (let i = 0; i < attempts && !stopped(); i++) {
    try {
      if (await check()) return true;
    } catch (error) {
      lastError = error;
    }
    await setTimeout(1000);
  }
  if (lastError && !stopped()) throw lastError;
  return false;
}
export async function iosDevice(env) {
  const data = JSON.parse(
    await command(
      'xcrun',
      ['simctl', 'list', 'devices', 'available', '-j'],
      env,
    ),
  );
  const devices = Object.values(data.devices)
    .flat()
    .filter((device) => device.name.startsWith('iPhone'));
  const device =
    devices.find((item) => item.state === 'Booted') ??
    devices.find(
      (item) => item.name === (env.SONGSMITH_IOS_SIMULATOR || 'iPhone 17'),
    );
  if (!device)
    throw new Error(
      'Create an iPhone 17 simulator in Xcode, or set SONGSMITH_IOS_SIMULATOR.',
    );
  if (device.state !== 'Booted')
    await command('xcrun', ['simctl', 'boot', device.udid], env);
  return device.udid;
}
export async function androidDevice(env, stopped = () => false) {
  const adb = join(env.ANDROID_HOME, 'platform-tools/adb');
  const emulator = join(env.ANDROID_HOME, 'emulator/emulator');
  const find = async () =>
    (await command(adb, ['devices'], env))
      .split('\n')
      .map((line) => line.match(/^(emulator-\d+)\s+device$/)?.[1])
      .find(Boolean);
  let id = await find();
  if (!id) {
    const avds = (await command(emulator, ['-list-avds'], env))
      .split('\n')
      .filter(Boolean);
    const avd = env.SONGSMITH_ANDROID_AVD || avds[0];
    if (!avd || !avds.includes(avd))
      throw new Error(
        'Create an AVD in Android Studio or correct SONGSMITH_ANDROID_AVD.',
      );
    const child = spawn(emulator, ['-avd', avd], {
      env,
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () =>
      console.error(
        'Android emulator could not start. Open the AVD in Android Studio.',
      ),
    );
    child.unref();
    if (
      !(await waitFor(
        async () => {
          id = await find();
          return Boolean(id);
        },
        stopped,
        120,
      ))
    )
      throw new Error(
        'Android Emulator did not become available within 120 seconds.',
      );
  }
  if (
    !(await waitFor(
      async () =>
        (await command(
          adb,
          ['-s', id, 'shell', 'getprop', 'sys.boot_completed'],
          env,
        )) === '1',
      stopped,
      120,
    ))
  )
    throw new Error(
      'Android Emulator boot did not complete within 120 seconds.',
    );
  return { adb, id };
}
export async function openDevices(env, stopped) {
  await Promise.allSettled([
    (async () => {
      try {
        const id = await iosDevice(env);
        if (
          !(await command(
            'xcrun',
            ['simctl', 'get_app_container', id, app],
            env,
          ))
        ) {
          console.warn(
            '[ios] Install the development build: pnpm mobile:build:ios',
          );
          return;
        }
        if (
          !(await waitFor(
            async () => (await fetch('http://localhost:8081/status')).ok,
            stopped,
          ))
        )
          throw new Error('Metro did not start on port 8081.');
        await command('xcrun', ['simctl', 'terminate', id, app], env);
        await command(
          'xcrun',
          ['simctl', 'openurl', id, devClientUrl('ios')],
          env,
        );
      } catch (error) {
        console.warn(
          `[ios] ${commandError(error)}\nRun pnpm mobile:build:ios after fixing the simulator.`,
        );
      }
    })(),
    (async () => {
      try {
        const { adb, id } = await androidDevice(env, stopped);
        if (
          !(await command(adb, ['-s', id, 'shell', 'pm', 'path', app], env))
            .split('\n')
            .some((line) => line.startsWith('package:'))
        ) {
          console.warn(
            '[android] Install the development build: pnpm mobile:build:android',
          );
          return;
        }
        if (
          !(await waitFor(
            async () => (await fetch('http://localhost:8081/status')).ok,
            stopped,
          ))
        )
          throw new Error('Metro did not start on port 8081.');
        await command(adb, ['-s', id, 'shell', 'am', 'force-stop', app], env);
        await command(
          adb,
          [
            '-s',
            id,
            'shell',
            'am',
            'start',
            '-a',
            'android.intent.action.VIEW',
            '-d',
            // adb shell joins arguments into a shell command; protect query ampersands.
            `'${devClientUrl('android')}'`,
            app,
          ],
          env,
        );
      } catch (error) {
        console.warn(
          `[android] ${commandError(error)}\nRun pnpm mobile:build:android after fixing the emulator.`,
        );
      }
    })(),
  ]);
}
