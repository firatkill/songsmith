import { describe, expect, it } from 'vitest';
import { resolveEnv } from './env';
import { selectLocale } from './i18n';
import { gateStage, gatePresentation } from './auth/gate';
import { chunkedStorage, type SecureStorage } from './auth/storage';
const base = {
  platform: 'ios' as const,
  physicalDevice: false,
  supabaseUrl: 'http://127.0.0.1:54321',
  anonKey: 'test',
};
describe('mobile host resolution', () => {
  it.each([
    ['ios', 'localhost'],
    ['android', '10.0.2.2'],
  ] as const)('%s simulator', (platform, host) => {
    expect(resolveEnv({ ...base, platform })).toEqual({
      apiUrl: `http://${host}:4000`,
      supabaseUrl: `http://${host}:54321`,
      anonKey: 'test',
    });
  });
  it('physical device uses LAN for both services', () => {
    expect(
      resolveEnv({ ...base, physicalDevice: true, devHost: '192.168.1.8' })
        .supabaseUrl,
    ).toBe('http://192.168.1.8:54321');
  });
  it('requires a physical host', () => {
    expect(() => resolveEnv({ ...base, physicalDevice: true })).toThrow(
      'EXPO_PUBLIC_DEV_HOST',
    );
  });
  it('API override and remote Supabase are preserved', () => {
    expect(
      resolveEnv({
        ...base,
        apiUrl: 'https://api.example.test',
        supabaseUrl: 'https://auth.example.test',
      }),
    ).toMatchObject({
      apiUrl: 'https://api.example.test',
      supabaseUrl: 'https://auth.example.test',
    });
  });
  it('rejects invalid URL, host and missing anon key', () => {
    for (const extra of [
      { apiUrl: 'invalid' },
      { devHost: 'http://host' },
      { anonKey: '' },
    ])
      expect(() => resolveEnv({ ...base, ...extra })).toThrow();
  });
});
it.each([
  [null, 'tr-TR', 'tr'],
  [null, 'de', 'en'],
  ['en', 'tr', 'en'],
  ['tr', 'en', 'tr'],
  ['invalid', null, 'en'],
])('locale %s / %s', (saved, device, expected) => {
  expect(selectLocale(saved ?? null, device ?? null)).toBe(expected);
});
it.each([
  [false, null, false, 'sign-in'],
  [true, { needsAgeGate: true, missingConsents: [] }, false, 'age-gate'],
  [true, { needsAgeGate: false, missingConsents: ['terms'] }, false, 'consent'],
  [false, null, true, 'refused'],
  [true, { needsAgeGate: false, missingConsents: [] }, false, 'ready'],
] as const)('gate %s %j %s', (signedIn, me, refused, expected) => {
  expect(gateStage(signedIn, me, refused)).toBe(expected);
});
function memoryStore() {
  const values = new Map<string, string>();
  const store: SecureStorage = {
    getItemAsync: (key) => Promise.resolve(values.get(key) ?? null),
    setItemAsync: (key, value) => {
      expect(new TextEncoder().encode(value).length).toBeLessThan(2048);
      values.set(key, value);
      return Promise.resolve();
    },
    deleteItemAsync: (key) => {
      values.delete(key);
      return Promise.resolve();
    },
  };
  return { values, store };
}
it('secure storage round trips large unicode sessions, replaces and removes all chunks', async () => {
  const { store, values } = memoryStore();
  const storage = chunkedStorage(store);
  const text = 'ş🎵'.repeat(5000);
  await storage.setItem('session', text);
  expect(await storage.getItem('session')).toBe(text);
  await storage.setItem('session', 'new');
  expect(await storage.getItem('session')).toBe('new');
  expect(values.size).toBe(2);
  await storage.removeItem('session');
  expect(await storage.getItem('session')).toBeNull();
  expect(values.size).toBe(0);
});
it('failed write retains the previous session', async () => {
  const { store } = memoryStore();
  const storage = chunkedStorage(store);
  await storage.setItem('session', 'previous');
  const write = store.setItemAsync;
  store.setItemAsync = (key, value) =>
    key.endsWith('.b.1')
      ? Promise.reject(new Error('full'))
      : write(key, value);
  await expect(storage.setItem('session', 'x'.repeat(1000))).rejects.toThrow(
    'full',
  );
  expect(await storage.getItem('session')).toBe('previous');
});
it('serializes overlapping writes and deletion', async () => {
  const { store, values } = memoryStore();
  const storage = chunkedStorage(store);
  await Promise.all([
    storage.setItem('session', 'one'.repeat(1000)),
    storage.setItem('session', 'two'),
    storage.removeItem('session'),
  ]);
  expect(values.size).toBe(0);
});
it('incomplete storage fails closed', async () => {
  const { store, values } = memoryStore();
  const storage = chunkedStorage(store);
  await storage.setItem('session', 'x'.repeat(1000));
  values.delete('session.a.1');
  expect(await storage.getItem('session')).toBeNull();
});

it.each(['', '  \t '])(
  'blank mobile optional configuration uses defaults (%j)',
  (blank) => {
    expect(
      resolveEnv({
        ...base,
        devHost: blank,
        apiUrl: blank,
        supabaseUrl: blank,
      }),
    ).toEqual(resolveEnv(base));
    expect(() => resolveEnv({ ...base, anonKey: blank })).toThrow();
  },
);
it.each([
  [false, true, false, 'initial-loading'],
  [false, false, true, 'initial-error'],
  [false, true, true, 'initial-loading'],
  [true, false, false, 'navigator'],
  [true, true, false, 'navigator'],
  [true, false, true, 'background-error'],
  [true, true, true, 'background-error'],
] as const)(
  'refresh presentation initialized=%s loading=%s error=%s',
  (initialized, loading, error, expected) => {
    expect(gatePresentation(initialized, loading, error)).toBe(expected);
  },
);
