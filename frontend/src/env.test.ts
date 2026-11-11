import { afterEach, expect, test, vi } from 'vitest';
import { publicEnv } from './env';
afterEach(() => {
  vi.unstubAllEnvs();
});
test('public API defaults to port 4000', () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-public-key');
  vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
  expect(publicEnv().NEXT_PUBLIC_API_URL).toBe('http://localhost:4000');
});
test.each([
  'invalid-private-value',
  'ftp://localhost',
  'javascript:private-value',
])('rejects a non-HTTP URL without echoing its value: %s', (value) => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', value);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-public-key');
  expect(publicEnv).toThrow(
    'Invalid public environment: NEXT_PUBLIC_SUPABASE_URL',
  );
  try {
    publicEnv();
  } catch (error) {
    expect(String(error)).not.toContain(value);
  }
});
