import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@songsmith/schemas';
import {
  grantCredits,
  reserveCredits,
  releaseReservation,
  reconcileCredits,
  startJob,
} from '../../src/credits/ledger.js';
import {
  onJobFailedReleaseCredits,
  sweepJobs,
} from '../../src/jobs/sweeper.js';

const status = z
  .object({
    API_URL: z.url(),
    ANON_KEY: z.string(),
    SERVICE_ROLE_KEY: z.string(),
    MAILPIT_URL: z.url(),
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
  throw new Error('Local database required');
const client = createClient<Database>(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const service = () => client;
const users: string[] = [];
function sql(query: string) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_songsmith',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
}
async function user() {
  const result = await client.auth.admin.createUser({
    email: `credits+${randomUUID()}@example.test`,
    email_confirm: false,
  });
  if (result.error) throw result.error;
  users.push(result.data.user.id);
  return result.data.user.id;
}
afterAll(async () => {
  for (const id of users) {
    const result = await client.auth.admin.deleteUser(id);
    if (result.error) throw result.error;
  }
});
it('IT-01 fifty concurrent reservations admit exactly ten; ledger reconciles', async () => {
  const id = await user();
  await grantCredits(service, {
    p_user_id: id,
    p_amount: 100,
    p_kind: 'signup_grant',
    p_ref_kind: 'test',
    p_ref_id: id,
    p_idem_key: randomUUID(),
  });
  const results = await Promise.allSettled(
    Array.from({ length: 50 }, () =>
      reserveCredits(service, {
        p_user_id: id,
        p_job_id: null,
        p_amount: 10,
        p_idem_key: randomUUID(),
      }),
    ),
  );
  const successes = results.filter((r) => r.status === 'fulfilled');
  const failures = results.filter((r) => r.status === 'rejected');
  expect(successes).toHaveLength(10);
  expect(failures).toHaveLength(40);
  for (const failure of failures)
    expect(failure.reason).toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
  const account = await client
    .schema('app')
    .from('credit_accounts')
    .select()
    .eq('user_id', id)
    .single();
  expect(account.error).toBeNull();
  expect(account.data).toMatchObject({ balance: 100, held: 100 });
  expect(await reconcileCredits(service)).toEqual([]);
  for (const r of successes)
    await releaseReservation(service, {
      p_reservation_id: r.value.id,
      p_reason: 'test_cleanup',
    });
}, 15000);
it('IT-03 reconciliation detects an injected balance discrepancy and cleanup restores it', async () => {
  const id = await user();
  await grantCredits(service, {
    p_user_id: id,
    p_amount: 10,
    p_kind: 'signup_grant',
    p_ref_kind: 'test',
    p_ref_id: id,
    p_idem_key: randomUUID(),
  });
  try {
    sql(`update app.credit_accounts set balance=11 where user_id='${id}';`);
    expect(await reconcileCredits(service)).toEqual(
      expect.arrayContaining([
        { user_id: id, check: 'balance', expected: 10, actual: 11 },
      ]),
    );
  } finally {
    sql(`update app.credit_accounts set balance=10 where user_id='${id}';`);
  }
  expect(
    (await reconcileCredits(service)).filter((r) => r.user_id === id),
  ).toEqual([]);
});
it('sweeper expires holds and failure hook releases the job reservation', async () => {
  const id = await user();
  await grantCredits(service, {
    p_user_id: id,
    p_amount: 20,
    p_kind: 'signup_grant',
    p_ref_kind: 'test',
    p_ref_id: id,
    p_idem_key: randomUUID(),
  });
  const reservation = await reserveCredits(service, {
    p_user_id: id,
    p_job_id: null,
    p_amount: 5,
    p_idem_key: randomUUID(),
  });
  sql(
    `update app.credit_reservations set expires_at=now()-interval '1 minute' where id='${reservation.id}';`,
  );
  // Runs in the isolated project after the jobs suite has cleaned up.
  await sweepJobs(service, new Map());
  const expired = await client
    .schema('app')
    .from('credit_reservations')
    .select('status')
    .eq('id', reservation.id)
    .single();
  expect(expired.data?.status).toBe('expired');
  const job = await startJob(service, {
    p_user_id: id,
    p_operation: 'generate',
    p_model_id: 'mock-music-a',
    p_amount: 5,
    p_idem_key: randomUUID(),
    p_concurrency_limit: 2,
  });
  try {
    await onJobFailedReleaseCredits(service, job.id);
    await onJobFailedReleaseCredits(service, job.id);
    const released = await client
      .schema('app')
      .from('credit_reservations')
      .select('status')
      .eq('id', job.reservation_id)
      .single();
    expect(released.data?.status).toBe('released');
  } finally {
    await client.from('generation_jobs').delete().eq('id', job.id);
  }
});
it('OTP confirmation grants exactly one signup credit entry', async () => {
  const email = `credits-otp+${randomUUID()}@example.test`;
  const auth = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const requested = await auth.auth.signInWithOtp({ email });
  expect(requested.error).toBeNull();
  let otp: string | undefined;
  try {
    await expect
      .poll(
        async () => {
          const response = await fetch(
            `${status.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          );
          const inbox = z
            .object({ messages: z.array(z.object({ Subject: z.string() })) })
            .parse(await response.json());
          otp = inbox.messages[0]?.Subject.match(/\b\d{6}\b/)?.[0];
          return otp;
        },
        { timeout: 10000, interval: 200 },
      )
      .toBeTruthy();
    if (!otp) throw new Error('OTP missing');
    const verified = await auth.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });
    if (verified.error) throw verified.error;
    const id = verified.data.user?.id;
    if (!id) throw new Error('User missing');
    sql(`update auth.users set email_confirmed_at=now() where id='${id}';`);
    const entries = await client
      .schema('app')
      .from('credit_ledger')
      .select('kind,amount')
      .eq('user_id', id);
    expect(entries.error).toBeNull();
    expect(entries.data).toEqual([{ kind: 'signup_grant', amount: 30 }]);
  } finally {
    const listed = await client.auth.admin.listUsers({ perPage: 1000 });
    const created = listed.data.users.find((u) => u.email === email);
    if (created) users.push(created.id);
  }
}, 15000);
