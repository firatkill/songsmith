import process from 'node:process';
import console from 'node:console';
import { localEnvironment, supervisor } from './dev-common.mjs';
import { androidDevice } from './mobile-devices.mjs';
const platform = process.argv[2];
if (!['ios', 'android'].includes(platform))
  throw new Error('Expected ios or android');
try {
  const local = localEnvironment();
  const env = {
    ...local,
    SONGSMITH_NATIVE_DEVELOPMENT: '1',
    ...(platform === 'ios'
      ? {
          LANG: local.LANG || 'en_US.UTF-8',
          LC_ALL: local.LC_ALL || 'en_US.UTF-8',
        }
      : {}),
  };
  const tasks = supervisor(env);
  if (await tasks.run('shared', ['--filter', '@songsmith/mobile^...', 'build']))
    tasks.stop(1);
  else if (
    await tasks.run('prebuild', [
      '--filter',
      '@songsmith/mobile',
      'exec',
      'expo',
      'prebuild',
      '--no-install',
      '--platform',
      platform,
    ])
  )
    tasks.stop(1);
  else {
    const device =
      platform === 'ios'
        ? env.SONGSMITH_IOS_SIMULATOR || 'iPhone 17'
        : (await androidDevice(env, () => tasks.stopping)).id;
    process.exitCode = await tasks.run('native', [
      '--filter',
      '@songsmith/mobile',
      'exec',
      'expo',
      `run:${platform}`,
      '--device',
      device,
    ]);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
