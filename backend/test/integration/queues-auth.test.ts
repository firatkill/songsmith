import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@songsmith/schemas';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/lib/env.js';
import { createLogger } from '../../src/lib/log.js';
import { serve } from '../http.js';
const status = z
  .object({
    API_URL: z.url(),
    ANON_KEY: z.string(),
    SERVICE_ROLE_KEY: z.string(),
  })
  .parse(
    JSON.parse(
      execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
        cwd: new URL('../../..', import.meta.url),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    ),
  );
if (new URL(status.API_URL).hostname !== '127.0.0.1')
  throw new Error('Local Supabase required');
const client = createClient<Database>(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
function totp(secret: string) {
  const bits = (secret.toUpperCase().match(/[A-Z2-7]/g) ?? [])
    .map((c) =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
        .indexOf(c)
        .toString(2)
        .padStart(5, '0'),
    )
    .join('');
  const bytes = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', bytes).update(counter).digest();
  const offset = (hash.at(-1) ?? 0) & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, '0');
}
it('Bull Board requires JWT, staff role and verified AAL2 (including subroutes)', async () => {
  const app = createApp({
    env: loadEnv({
      APP_ENV: 'ci',
      SUPABASE_URL: status.API_URL,
      SUPABASE_ANON_KEY: status.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    }),
    logger: createLogger('silent'),
  });
  const http = await serve(app);
  const auth = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let userId: string | undefined;
  try {
    const email = `queue-auth+${randomUUID()}@example.test`,
      password = randomUUID();
    const user = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (user.error) throw user.error;
    userId = user.data.user.id;
    const signed = await auth.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    const token = signed.data.session.access_token;
    const request = (path: string, access?: string) =>
      fetch(`${http.url}/v1/admin/queues${path}`, {
        headers: access ? { Authorization: `Bearer ${access}` } : {},
      });
    for (const path of ['/', '/api/queues']) {
      expect((await request(path)).status).toBe(401);
      expect((await request(path, token)).status).toBe(403);
    }
    const staff = await client
      .schema('app')
      .from('staff_roles')
      .insert({ user_id: userId, role: 'admin' });
    if (staff.error) throw staff.error;
    expect((await request('/', token)).status).toBe(403);
    const enrolled = await auth.auth.mfa.enroll({ factorType: 'totp' });
    if (enrolled.error) throw enrolled.error;
    const verified = await auth.auth.mfa.challengeAndVerify({
      factorId: enrolled.data.id,
      code: totp(enrolled.data.totp.secret),
    });
    if (verified.error) throw verified.error;
    const response = await request('/', verified.data.access_token);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    // AAL2 alone is insufficient once the role is removed.
    await client
      .schema('app')
      .from('staff_roles')
      .delete()
      .eq('user_id', userId);
    expect((await request('/', verified.data.access_token)).status).toBe(403);
  } finally {
    await http.close();
    await (app.locals['closeQueues'] as () => Promise<void>)();
    if (userId) await client.auth.admin.deleteUser(userId);
  }
}, 20000);
