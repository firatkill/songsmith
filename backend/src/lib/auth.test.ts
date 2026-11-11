import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import {
  createRemoteJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  UnsecuredJWT,
} from 'jose';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@songsmith/schemas';
import {
  createJwtVerifier,
  isAdult,
  profileStage,
  requireConsent,
} from './auth.js';
import { requestContext } from './correlation.js';
import { errorMiddleware } from './errors.js';
import { createLogger } from './log.js';
import { serve } from '../../test/http.js';
const userId = randomUUID();
const issuer = 'https://issuer.example.test/auth/v1';
const keys = await generateKeyPair('ES256');
let http: Awaited<ReturnType<typeof serve>>;
let verify: ReturnType<typeof createJwtVerifier>;
beforeAll(async () => {
  const app = express();
  app.get('/jwks', async (_req, res) => {
    res.json({
      keys: [
        { ...(await exportJWK(keys.publicKey)), kid: 'unit', alg: 'ES256' },
      ],
    });
  });
  http = await serve(app);
  verify = createJwtVerifier(
    issuer,
    createRemoteJWKSet(new URL(`${http.url}/jwks`)),
  );
});
afterAll(async () => {
  await http.close();
});
async function token(claims: Record<string, unknown> = {}) {
  return new SignJWT({
    sub: userId,
    role: 'authenticated',
    iss: issuer,
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 60,
    ...claims,
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'unit' })
    .sign(keys.privateKey);
}
describe('JWT verification against stub HTTP JWKS', () => {
  it('accepts valid signed JWT', async () => {
    expect(await verify(await token())).toBe(userId);
  });
  it.each([
    { exp: 1 },
    { iss: 'https://wrong.test' },
    { aud: 'anon' },
    { role: 'service_role' },
    { sub: 'bad-id' },
    { exp: undefined },
  ])('rejects claims %j', async (claims) => {
    await expect(verify(await token(claims))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
  it('rejects none algorithm', async () => {
    await expect(
      verify(new UnsecuredJWT({ sub: userId }).encode()),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
  it('rejects symmetric algorithm', async () => {
    const jwt = await new SignJWT({ sub: userId })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new Uint8Array(32));
    await expect(verify(jwt)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
  it('rejects tampered signature', async () => {
    const parts = (await token()).split('.');
    parts[2] = Buffer.alloc(64).toString('base64url');
    await expect(verify(parts.join('.'))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});
it.each([
  ['2008-11-11', '2026-11-11T00:00:00Z', true],
  ['2008-11-12', '2026-11-11T23:59:59Z', false],
  ['2008-11-11', '2026-11-10T23:59:59Z', false],
  ['2008-02-29', '2026-02-28T23:59:59Z', false],
  ['2008-02-29', '2026-03-01T00:00:00Z', true],
  ['2004-02-29', '2024-02-29T00:00:00Z', true],
  ['2008-11-11', '2026-11-11T02:00:00+03:00', false],
  ['2008-11-11', '2026-11-11T03:00:00+03:00', true],
])('UTC age %s at %s = %s', (birth, today, expected) => {
  expect(isAdult(birth, new Date(today))).toBe(expected);
});
it.each([
  [[], false],
  [[{ granted: true, version: '2026-11-01' }], true],
  [[{ granted: false, version: '2026-11-01' }], false],
  [[{ granted: true, version: 'stale' }], false],
  [
    [
      { granted: false, version: '2026-11-01' },
      { granted: true, version: '2026-11-01' },
    ],
    false,
  ],
] as const)(
  'requireConsent honors latest current grant: %j',
  async (states, allowed) => {
    const rows = states.map((s) => ({
      id: randomUUID(),
      user_id: userId,
      kind: 'ai_disclosure',
      at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      source: 'web',
      ...s,
    }));
    const client = createClient<Database>('http://127.0.0.1:1', 'stub', {
      global: {
        fetch: (url) =>
          Promise.resolve(
            new Response(
              JSON.stringify(
                (url instanceof Request ? url.url : url.toString()).includes(
                  'kind=eq.ai_disclosure',
                )
                  ? rows.slice(0, 1)
                  : [],
              ),
              {
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          ),
      },
    });
    const check = requireConsent('ai_disclosure')(() => client, userId);
    if (allowed) await expect(check).resolves.toBeUndefined();
    else
      await expect(check).rejects.toMatchObject({
        code: 'CONSENT_REQUIRED',
        details: { kind: 'ai_disclosure' },
      });
  },
);

describe('profile stage with stubbed service responses', () => {
  it.each([
    {
      name: 'existing profile skips Auth lookup',
      profileExists: true,
      authStatus: 200,
      authCode: '',
      expectedStatus: 200,
      expectedCode: undefined,
    },
    {
      name: 'deleted Auth identity is unauthenticated',
      profileExists: false,
      authStatus: 404,
      authCode: 'user_not_found',
      expectedStatus: 401,
      expectedCode: 'UNAUTHENTICATED',
    },
    {
      name: 'existing Auth identity without profile is a provisioning error',
      profileExists: false,
      authStatus: 200,
      authCode: '',
      expectedStatus: 500,
      expectedCode: 'INTERNAL',
    },
    {
      name: 'Auth server failure is internal',
      profileExists: false,
      authStatus: 500,
      authCode: 'unexpected_failure',
      expectedStatus: 500,
      expectedCode: 'INTERNAL',
    },
    {
      name: 'unrelated Auth 404 is internal',
      profileExists: false,
      authStatus: 404,
      authCode: 'unexpected_failure',
      expectedStatus: 500,
      expectedCode: 'INTERNAL',
    },
    {
      name: 'Auth permission failure is internal',
      profileExists: false,
      authStatus: 403,
      authCode: 'not_admin',
      expectedStatus: 500,
      expectedCode: 'INTERNAL',
    },
  ])(
    '$name',
    async ({
      profileExists,
      authStatus,
      authCode,
      expectedStatus,
      expectedCode,
    }) => {
      let authLookups = 0;
      const lines: string[] = [];
      const client = createClient<Database>('http://127.0.0.1:1', 'stub', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input) => {
            const url = new URL(
              input instanceof Request ? input.url : input.toString(),
            );
            if (url.pathname.startsWith('/rest/v1/profiles')) {
              return Promise.resolve(
                Response.json(
                  profileExists
                    ? [
                        {
                          id: userId,
                          handle: 'artist',
                          display_name: 'Artist',
                          bio: '',
                          avatar_seed: '',
                          locale: 'en',
                          is_adult: true,
                          adult_verified_at: '2026-11-11T00:00:00Z',
                          remix_default: false,
                          explicit_hidden: true,
                          status: 'active',
                          created_at: '2026-11-11T00:00:00Z',
                          updated_at: '2026-11-11T00:00:00Z',
                        },
                      ]
                    : [],
                ),
              );
            }
            expect(url.pathname).toBe(`/auth/v1/admin/users/${userId}`);
            authLookups++;
            return Promise.resolve(
              Response.json(
                authStatus === 200
                  ? {
                      id: userId,
                      aud: 'authenticated',
                      created_at: '2026-11-11T00:00:00Z',
                      app_metadata: {},
                      user_metadata: {},
                    }
                  : { code: authCode, msg: 'Stub Auth lookup failed' },
                {
                  status: authStatus,
                  headers: { 'X-Supabase-Api-Version': '2024-01-01' },
                },
              ),
            );
          },
        },
      });
      const app = express();
      app.use((_req, _res, next) => {
        requestContext.run(
          { correlationId: 'profile-unit', requestId: 'profile-unit', userId },
          next,
        );
      });
      app.use(profileStage(() => client));
      app.get('/probe', (_req, res) => {
        res.json({ ok: true });
      });
      app.use(
        errorMiddleware(
          createLogger('info', {
            write: (line) => {
              lines.push(line);
            },
          }),
        ),
      );
      const server = await serve(app);
      try {
        const response = await fetch(`${server.url}/probe`);
        expect(response.status).toBe(expectedStatus);
        if (expectedCode)
          expect(await response.json()).toMatchObject({
            error: { code: expectedCode },
          });
        expect(authLookups).toBe(profileExists ? 0 : 1);
        const errors = lines
          .map(
            (line) =>
              JSON.parse(line) as {
                level: string;
                errorCode: string;
                userId: string;
              },
          )
          .filter((line) => line.level === 'error');
        expect(errors).toHaveLength(expectedStatus === 500 ? 1 : 0);
        if (expectedStatus === 500)
          expect(errors[0]).toMatchObject({ errorCode: 'INTERNAL', userId });
      } finally {
        await server.close();
      }
    },
  );
});
