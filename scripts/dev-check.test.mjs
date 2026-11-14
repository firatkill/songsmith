import { expect, it } from 'vitest';
import {
  checkMockEnv,
  classifyPort,
  parseVersion,
  versionAtLeast,
} from './dev-check-pure.mjs';
it('parses versions and compares semantically', () => {
  expect(parseVersion('v24.13.0')).toEqual([24, 13, 0]);
  expect(parseVersion('garbage')).toBeNull();
  expect(versionAtLeast('22.1.0', [22, 0, 0])).toBe(true);
  expect(versionAtLeast('20.99.0', [22, 0, 0])).toBe(false);
});
it('port ownership is explicit, not inferred from node process name', () => {
  expect(classifyPort([], [])).toBe('free');
  expect(classifyPort([{ pid: 1, command: 'node' }], [1])).toBe('ours');
  expect(classifyPort([{ pid: 1, command: 'node' }], [])).toBe('conflict');
  expect(classifyPort([{ pid: 2, command: 'com.docker' }], [], true)).toBe(
    'ours',
  );
  expect(classifyPort([{ pid: 2, command: 'com.docker' }], [], false)).toBe(
    'conflict',
  );
});
it('mock env completeness reports names only, defaults and injected credentials are allowed', () => {
  expect(checkMockEnv({})).toEqual([]);
  expect(
    checkMockEnv({
      APP_ENV: 'local',
      PROVIDER_MODE: 'mock',
      SUPABASE_SERVICE_ROLE_KEY: '',
    }),
  ).toEqual([]);
  expect(
    checkMockEnv({
      PROVIDER_MODE: 'SECRET',
      APP_ENV: 'SECRET',
      API_PORT: '5000',
    }),
  ).toEqual(['APP_ENV', 'PROVIDER_MODE', 'API_PORT']);
});

it('development output never exposes injected or CLI credentials', async () => {
  const { redactDevLine } = await import('./dev-common.mjs');
  expect(
    redactDevLine('key=sensitive-test-key', {
      SUPABASE_ANON_KEY: 'sensitive-test-key',
    }),
  ).toBe('key=[redacted]');
  expect(redactDevLine('anon key: example')).toBe('[credentials omitted]');
  expect(redactDevLine('eyJtest.payload.signature')).toBe('[redacted]');
});

it('blank or whitespace-only environment entries use defaults', () => {
  expect(
    checkMockEnv({
      APP_ENV: '  ',
      PROVIDER_MODE: '\t',
      API_PORT: '',
      ALLOW_LIVE_PROVIDERS: '  ',
    }),
  ).toEqual([]);
});
it('Xcode minimum accepts patch versions and rejects old or unknown versions', async () => {
  const { checkXcode } = await import('./dev-check-pure.mjs');
  expect(checkXcode('Xcode 26.2\nBuild version 17C52')).toEqual({
    installed: '26.2',
    required: '26.4',
    supported: false,
  });
  for (const version of ['26.4', '26.4.1', '27.0'])
    expect(checkXcode(`Xcode ${version}`).supported).toBe(true);
  expect(checkXcode('unknown').supported).toBe(false);
});

it('native tool environment ignores blank overrides before SDK fallback', async () => {
  const { nativeEnvironment } = await import('./dev-common.mjs');
  const env = nativeEnvironment({
    ANDROID_HOME: '  ',
    ANDROID_SDK_ROOT: '/test/sdk',
    SONGSMITH_ANDROID_AVD: '\t',
    PATH: '/bin',
  });
  expect(env.ANDROID_HOME).toBe('/test/sdk');
  expect(env.SONGSMITH_ANDROID_AVD).toBeUndefined();
});
