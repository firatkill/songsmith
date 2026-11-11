import { expect, it } from 'vitest';
import { rateLimitIdentity } from './rate-limit.js';
it('rate-limit identities separate routes/users and HMAC IPs with a server secret', () => {
  const option = { key: 'me_patch', by: 'user_or_ip' } as const;
  expect(rateLimitIdentity(option, 'user-1', '192.0.2.1', 'secret')).toBe(
    'me_patch:user:user-1',
  );
  const key = rateLimitIdentity(option, undefined, '192.0.2.1', 'secret');
  expect(key).toMatch(/^me_patch:ip:[a-f0-9]{64}$/);
  expect(key).not.toContain('192.0.2.1');
  expect(rateLimitIdentity(option, undefined, '192.0.2.1', 'secret')).toBe(key);
  expect(rateLimitIdentity(option, undefined, '192.0.2.1', 'other')).not.toBe(
    key,
  );
  expect(
    rateLimitIdentity({ ...option, by: 'ip' }, 'user-1', '192.0.2.1', 'secret'),
  ).toBe(key);
  expect(() =>
    rateLimitIdentity(
      { ...option, by: 'user' },
      undefined,
      '192.0.2.1',
      'secret',
    ),
  ).toThrow('UNAUTHENTICATED');
});
