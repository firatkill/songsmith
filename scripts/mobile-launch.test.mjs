import { expect, it, vi } from 'vitest';
import { URL } from 'node:url';
import {
  devClientUrl,
  retryQuery,
  commandError,
  classifyDeviceResult,
  runDeviceCommand,
} from './mobile-launch.mjs';

it.each(['ios', 'android'])(
  'encodes the %s host and disables launch UI',
  (platform) => {
    const params = new URL(devClientUrl(platform)).searchParams;
    expect(params.get('__expo_url')).toBe(
      platform === 'ios' ? 'http://localhost:8081' : 'http://10.0.2.2:8081',
    );
    expect(params.get('__expo_disable_onboarding')).toBe('1');
    expect(params.get('__expo_disable_auto_launch')).toBe('1');
  },
);
it('retries transient queries with short delays', async () => {
  const query = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue('package:app');
  const pause = vi.fn();
  expect(await retryQuery(query, pause)).toBe('package:app');
  expect(query).toHaveBeenCalledTimes(2);
  expect(pause).toHaveBeenCalledWith(1000);
});
it('bounds retries and preserves stderr for diagnostics', async () => {
  const error = Object.assign(new Error('Command failed'), {
    stderr: 'device offline\n',
  });
  const query = vi.fn().mockRejectedValue(error);
  await expect(retryQuery(query, vi.fn())).rejects.toBe(error);
  expect(query).toHaveBeenCalledTimes(3);
  expect(commandError(error)).toContain('device offline');
});
it('does not retry a successful missing-package response', async () => {
  const query = vi.fn().mockResolvedValue('');
  expect(await retryQuery(query, vi.fn())).toBe('');
  expect(query).toHaveBeenCalledTimes(1);
});

it.each([
  ['simctl', 'terminate', 'device', 'app'],
  ['simctl', 'openurl', 'device', 'songsmith://'],
  ['-s', 'device', 'shell', 'am', 'force-stop', 'app'],
  ['-s', 'device', 'shell', 'am', 'start'],
  ['-s', 'device', 'shell', 'getprop', 'sys.boot_completed'],
])('retries device action %j with increasing delays', async (...args) => {
  const run = vi
    .fn()
    .mockRejectedValueOnce(new Error('timeout'))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue('ok');
  const pause = vi.fn();
  expect(await runDeviceCommand(run, args, pause)).toBe('ok');
  expect(pause.mock.calls).toEqual([[1000], [2000]]);
});
it.each([
  { code: 2 },
  {
    stderr:
      'An error was encountered (domain=NSPOSIXErrorDomain, code=2):\nNo such file or directory',
  },
])('does not retry an absent iOS build: %j', async (details) => {
  const run = vi
    .fn()
    .mockRejectedValue(Object.assign(new Error('Command failed'), details));
  const pause = vi.fn();
  expect(
    await runDeviceCommand(
      run,
      ['simctl', 'get_app_container', 'device', 'app'],
      pause,
    ),
  ).toBe('');
  expect(run).toHaveBeenCalledTimes(1);
  expect(pause).not.toHaveBeenCalled();
});
it('classifies missing Android packages without masking command failures', () => {
  const args = ['-s', 'device', 'shell', 'pm', 'path', 'app'];
  expect(classifyDeviceResult(args, '', undefined)).toBe('missing');
  expect(classifyDeviceResult(args, 'package:/app.apk', undefined)).toBe('ok');
  expect(classifyDeviceResult(args, '', { code: 2, message: 'offline' })).toBe(
    'error',
  );
  expect(
    classifyDeviceResult(['simctl', 'openurl'], '', {
      code: 2,
      message: 'failed',
    }),
  ).toBe('error');
});
it('does not retry terminating an already stopped iOS app', async () => {
  const run = vi
    .fn()
    .mockRejectedValue(new Error('found nothing to terminate'));
  expect(await runDeviceCommand(run, ['simctl', 'terminate'], vi.fn())).toBe(
    '',
  );
  expect(run).toHaveBeenCalledTimes(1);
});
