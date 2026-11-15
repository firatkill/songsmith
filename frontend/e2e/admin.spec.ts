import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { catalogueSchema } from '@songsmith/schemas';
import { signIn } from './helpers';

// Local service credentials come from scripts/e2e-web.mjs (supabase status).
function service() {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('Run through pnpm e2e');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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

// Isolated: disables a shared catalogue model and restores it in `finally`.
test('E2E-04 @isolated staff with MFA disables a model and it becomes unusable', async ({
  page,
  request,
}) => {
  const admin = service();
  const email = await signIn(page, request);
  const users = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (users.error) throw users.error;
  const userId = users.data.users.find((user) => user.email === email)?.id;
  if (!userId) throw new Error('Signed-in user not found');
  try {
    // Without a staff role or MFA the console is closed.
    await page.goto('/en/admin');
    await expect(page).toHaveURL('/en/admin/mfa');

    const adult = await admin
      .from('profiles')
      .update({ is_adult: true, adult_verified_at: new Date().toISOString() })
      .eq('id', userId);
    if (adult.error) throw adult.error;
    const staff = await admin
      .schema('app')
      .from('staff_roles')
      .insert({ user_id: userId, role: 'admin' });
    if (staff.error) throw staff.error;

    await page.reload();
    const secret = (await page.getByTestId('totp-secret').textContent()) ?? '';
    expect(secret.length).toBeGreaterThan(10);
    await page.getByLabel('6-digit code').fill(totp(secret));
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page).toHaveURL('/en/admin/catalogue');

    const status = page.getByTestId('status-mock-music-b');
    await expect(status).toHaveText('Usable');
    await page.getByRole('switch', { name: 'Enabled: mock-music-b' }).click();
    // The admin write invalidates this server's registry, so the change shows
    // at once; other processes see it within the 30 s catalogue cache.
    await expect(status).toHaveText('Not usable');
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'];
    if (!apiUrl) throw new Error('Run through pnpm e2e');
    const catalogue = await request.get(`${apiUrl}/v1/catalogue`);
    expect(catalogue.status()).toBe(200);
    expect(
      catalogueSchema
        .parse(await catalogue.json())
        .models.map((model) => model.id),
    ).not.toContain('mock-music-b');
    await page.reload();
    await expect(page.getByTestId('status-mock-music-b')).toHaveText(
      'Not usable',
    );

    const audit = await admin
      .schema('app')
      .from('audit_log')
      .select('action,target')
      .eq('actor_id', userId);
    if (audit.error) throw audit.error;
    expect(audit.data).toContainEqual({
      action: 'catalogue.update',
      target: 'models/mock-music-b',
    });
  } finally {
    await admin
      .from('models')
      .update({ enabled: true })
      .eq('id', 'mock-music-b');
    await admin.auth.admin.deleteUser(userId);
  }
});
