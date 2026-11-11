import { describe, it, expect } from 'vitest';
import { loadEnv } from './env.js';
import { newToken } from './ids.js';
import { createLogger } from './log.js';
import { requestContext } from './correlation.js';
import { testSource } from '../../test/http.js';

describe('UT-03 environment', () => {
  it('uses conservative defaults', () => {
    expect(loadEnv(testSource)).toMatchObject({
      APP_ENV: 'local',
      PROVIDER_MODE: 'mock',
      API_PORT: 4000,
      TRUST_PROXY_HOPS: 0,
      LOG_LEVEL: 'info',
      WEB_ORIGINS: ['http://localhost:3000'],
    });
  });
  it.each(['local', 'ci'])(
    'guards live in %s and permits explicit override',
    (APP_ENV) => {
      expect(() =>
        loadEnv({ ...testSource, APP_ENV, PROVIDER_MODE: 'live' }),
      ).toThrow('PROVIDER_MODE');
      expect(
        loadEnv({
          ...testSource,
          APP_ENV,
          PROVIDER_MODE: 'live',
          ALLOW_LIVE_PROVIDERS: 'true',
        }).PROVIDER_MODE,
      ).toBe('live');
    },
  );
  it('guards production mock with explicit override', () => {
    expect(() => loadEnv({ ...testSource, APP_ENV: 'production' })).toThrow(
      'PROVIDER_MODE',
    );
    expect(
      loadEnv({
        ...testSource,
        APP_ENV: 'production',
        ALLOW_MOCK_IN_PRODUCTION: 'true',
      }).PROVIDER_MODE,
    ).toBe('mock');
    expect(
      loadEnv({ ...testSource, APP_ENV: 'production', PROVIDER_MODE: 'live' })
        .PROVIDER_MODE,
    ).toBe('live');
  });
  it('lists invalid keys without values', () => {
    expect(() =>
      loadEnv({
        ...testSource,
        SUPABASE_URL: 'secret-url',
        SUPABASE_SERVICE_ROLE_KEY: '',
        API_PORT: 'secret-port',
        ALLOW_LIVE_PROVIDERS: 'yes',
      }),
    ).toThrow(/SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*API_PORT/);
    try {
      loadEnv({ ...testSource, SUPABASE_URL: 'secret-url' });
    } catch (e) {
      expect(String(e)).not.toContain('secret-url');
    }
  });
  it.each([
    { API_PORT: '0' },
    { API_PORT: '65536' },
    { TRUST_PROXY_HOPS: '-1' },
    { TRUST_PROXY_HOPS: '1.5' },
    { WEB_ORIGINS: 'https://example.com/path' },
    { LOG_LEVEL: 'nope' },
  ])('rejects invalid configuration %j', (value) => {
    expect(() => loadEnv({ ...testSource, ...value })).toThrow();
  });
});
describe('UT-05 logging', () => {
  function capture() {
    const lines: string[] = [];
    const log = createLogger('info', {
      write: (line) => {
        lines.push(line);
      },
    });
    return { log, lines, last: (): unknown => JSON.parse(lines.at(-1) ?? '') };
  }
  it('redacts compound keys in objects, headers and arrays', () => {
    const { log, last } = capture();
    const probe = {
      userEmail: 'a@b.c',
      recipientEmail: 'x@y.z',
      giftMessage: 'secret note',
      'x-api-key': 'k',
      headers: { 'x-api-key': 'k2' },
      sessionToken: 't',
      songLyrics: 'la la',
    };
    const expected = {
      userEmail: '[redacted]',
      recipientEmail: '[redacted]',
      giftMessage: '[redacted]',
      'x-api-key': '[redacted]',
      headers: { 'x-api-key': '[redacted]' },
      sessionToken: '[redacted]',
      songLyrics: '[redacted]',
    };
    log.info({ ...probe, nested: { entries: [probe] } }, 'probe');
    expect(last()).toMatchObject({
      ...expected,
      nested: { entries: [expected] },
    });
  });
  it('redacts nested gift recipients and occasions while preserving public profile fields', () => {
    const { log, last, lines } = capture();
    const profile = {
      handle: 'public_artist',
      displayname: 'Public Artist',
      displayName: 'Public Artist',
      bio: 'I write songs.',
    };
    log.info(
      {
        items: [
          {
            recipientName: 'Ayşe',
            occasion: 'Birthday',
            selectedOccasion: 'Anniversary',
            ...profile,
          },
        ],
        ...profile,
      },
      'probe',
    );
    expect(last()).toMatchObject({
      items: [
        {
          recipientName: '[redacted]',
          occasion: '[redacted]',
          selectedOccasion: '[redacted]',
          ...profile,
        },
      ],
      ...profile,
    });
    for (const value of ['Ayşe', 'Birthday', 'Anniversary'])
      expect(lines.join('')).not.toContain(value);
  });
  it('covers all sensitive fragments and exact generic keys without overmatching', () => {
    const { log, last } = capture();
    const keys = [
      'songLyric',
      'userDescription',
      'systemPrompt',
      'userEmail',
      'sessionToken',
      'userPassword',
      'dbPasswd',
      'clientSecret',
      'x-api-key',
      'proxyAuthorization',
      'set-cookie',
      'giftMessage',
      'recipientName',
      'selectedOccasion',
      'sharedMemories',
      'userInstruction',
      'audioTranscript',
      'text',
      'body',
      'message',
      'details',
      'key',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_ANON_KEY',
    ];
    const safe = {
      context: 'kept',
      bodyCount: 3,
      messageCount: 4,
      detailStatus: 'ok',
      keyboard: 'kept',
    };
    log.info(
      { ...Object.fromEntries(keys.map((key) => [key, 'private'])), ...safe },
      'probe',
    );
    expect(last()).toMatchObject({
      ...Object.fromEntries(keys.map((key) => [key, '[redacted]'])),
      ...safe,
    });
  });
  it('redacts JWT and email strings regardless of key, including arrays and log messages', () => {
    const { log, last, lines } = capture();
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.fake-signature';
    const email = 'someone@example.test';
    log.info(
      {
        arbitrary: jwt,
        other: email,
        nested: [{ value: `Bearer ${jwt}` }],
        values: [jwt, email, 'safe'],
      },
      'probe',
    );
    expect(last()).toMatchObject({
      arbitrary: '[redacted]',
      other: '[redacted]',
      nested: [{ value: '[redacted]' }],
      values: ['[redacted]', '[redacted]', 'safe'],
    });
    log.info(`Received ${email}`);
    expect(last()).toMatchObject({ msg: '[redacted]' });
    log.info('Received %s', jwt);
    expect(last()).toMatchObject({ msg: 'Received [redacted]' });
    expect(lines.join('')).not.toContain(jwt);
    expect(lines.join('')).not.toContain(email);
  });
  it('preserves observability and request fields', () => {
    const { log, last } = capture();
    const fields = {
      correlationId: 'correlation-123',
      userId: 'user-123',
      jobId: 'job-123',
      route: '/v1/health',
      latencyMs: 12,
      errorCode: 'NOT_FOUND',
      method: 'GET',
      status: 404,
      stack: '    at handler (/app/server.js:12:3)',
    };
    log.info(fields, 'Request completed');
    expect(last()).toMatchObject({
      ...fields,
      msg: 'Request completed',
      level: 'info',
    });
    expect(last()).toHaveProperty('time', expect.any(Number));
  });

  it('redacts nested keys, arrays and headers without mutating input', () => {
    const lines: string[] = [];
    const log = createLogger('info', {
      write: (s) => {
        lines.push(s);
      },
    });
    const data = {
      lyrics: 'private',
      nested: [
        {
          email: 'private',
          token: 'private',
          gift_details: 'private',
          prompt: 'private',
          password: 'private',
          api_key: 'private',
          body: 'private',
        },
      ],
      headers: {
        authorization: 'private',
        cookie: 'private',
        'set-cookie': 'private',
      },
    };
    requestContext.run(
      { correlationId: 'unit-correlation', requestId: 'unit-request' },
      () => {
        log.info(data, 'Safe event');
      },
    );
    expect(lines.join('')).not.toContain('private');
    expect(lines.join('')).toContain('[redacted]');
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      level: 'info',
      msg: 'Safe event',
      correlationId: 'unit-correlation',
      userId: null,
      jobId: null,
      route: null,
      latencyMs: null,
      errorCode: null,
    });
    expect(data.lyrics).toBe('private');
  });
});
it('UT-06 generates 10000 unique 128-bit base64url tokens', () => {
  const tokens = Array.from({ length: 10000 }, newToken);
  for (const token of tokens) {
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(16);
  }
  expect(new Set(tokens).size).toBe(10000);
});
