import { randomUUID } from 'node:crypto';
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { z } from 'zod';
const mailList = z.object({
  messages: z.array(
    z.object({
      ID: z.string(),
      To: z.array(z.object({ Address: z.string() })),
    }),
  ),
});
const mailBody = z.object({ Text: z.string() });
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter(
      (item) => item.impact === 'serious' || item.impact === 'critical',
    ),
  ).toEqual([]);
}
async function signIn(page: Page, request: APIRequestContext) {
  const email = `e2e+${randomUUID()}@example.test`;
  await page.goto('/en/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
  let code = '';
  // Mailpit is local; ordinary assertions retain the shared 3-second limit.
  await expect
    .poll(async () => {
      const response = await request.get(
        `http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
      );
      const messages = mailList.parse(await response.json()).messages;
      const message = messages.find((item) =>
        item.To.some((to) => to.Address === email),
      );
      if (!message) return false;
      const body = mailBody.parse(
        await (
          await request.get(
            `http://127.0.0.1:54324/api/v1/message/${message.ID}`,
          )
        ).json(),
      );
      code = body.Text.match(/\b\d{6}\b/)?.[0] ?? '';
      return code.length === 6;
    })
    .toBe(true);
  // A single input accepts pasted codes without six separate focus targets.
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await expect(page).toHaveURL('/en/age-gate');
  return email;
}
test('E2E-01 OTP, adult, consent, persisted session and sign out; onboarding accessibility', async ({
  page,
  request,
}) => {
  await signIn(page, request);
  await expect(page.locator('form')).toHaveAttribute('method', 'post');
  await accessible(page);
  await page.getByLabel('Day', { exact: true }).fill('1');
  await page.getByLabel('Month', { exact: true }).fill('1');
  await page.getByLabel('Year', { exact: true }).fill('1990');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL('/en/consent');
  await accessible(page);
  await expect(
    page.getByLabel('Marketing emails (optional)'),
  ).not.toBeChecked();
  await expect(
    page.getByLabel('Non-essential analytics (optional)'),
  ).not.toBeChecked();
  for (const name of [
    'I accept the terms of service (required)',
    'I acknowledge the privacy notice (required)',
    'I agree to the AI data disclosure (required)',
  ])
    await page.getByLabel(name, { exact: true }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL('/en/home');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /Welcome, user_[a-f0-9]{12}/,
  );
  await accessible(page);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /Welcome, user_/,
  );
  await page.getByText('Account', { exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL('/en/sign-in');
  await page.goto('/en/home');
  await expect(page).toHaveURL('/en/sign-in');
});
test('E2E-02 underage refusal clears session and blocks the same email', async ({
  page,
  request,
}) => {
  const email = await signIn(page, request);
  const year = new Date().getUTCFullYear() - 10;
  await page.getByLabel('Day', { exact: true }).fill('1');
  await page.getByLabel('Month', { exact: true }).fill('1');
  await page.getByLabel('Year', { exact: true }).fill(String(year));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL('/en/refused');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Unable to create account',
  );
  await page.goto('/en/home');
  await expect(page).toHaveURL('/en/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    'We could not sign you in. Check your details and try again.',
  );
  await expect(page.getByLabel('6-digit code')).toHaveCount(0);
});
test('E2E-03 security headers and nonce on marketing and protected redirect', async ({
  request,
}) => {
  const nonces = [];
  for (const path of ['/en', '/en/home']) {
    const response = await request.get(path, { maxRedirects: 0 });
    const headers = response.headers();
    const csp = headers['content-security-policy'] ?? '';
    const scripts =
      csp.split(';').find((part) => part.trim().startsWith('script-src')) ?? '';
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain('unsafe-inline');
    expect(scripts).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
    const nonce = scripts.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    nonces.push(nonce);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
  }
  expect(nonces[0]).not.toBe(nonces[1]);
});
test('production hydration and locale switch have no CSP violations', async ({
  page,
}) => {
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`CSP violation: ${event.violatedDirective}`);
    });
  });
  page.on('console', (message) => {
    if (message.text().startsWith('CSP violation:'))
      violations.push(message.text());
  });
  await page.goto('/en');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('tr');
  await expect(page).toHaveURL('/tr');
  expect(violations).toEqual([]);
});
test.describe('Turkish browser locale', () => {
  test.use({
    locale: 'tr-TR',
    extraHTTPHeaders: { 'Accept-Language': 'tr' },
    storageState: { cookies: [], origins: [] },
  });
  test('locale negotiation, explicit preference, same-page switch, auth guard and public accessibility', async ({
    page,
    context,
  }) => {
    // Each test gets a fresh context; also make the no-preference precondition explicit.
    await context.clearCookies();
    await page.goto('/');
    await expect(page).toHaveURL('/tr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await accessible(page);
    await page.goto('/tr/how-it-works');
    await page.getByRole('combobox', { name: 'Dil' }).selectOption('en');
    await expect(page).toHaveURL('/en/how-it-works');
    await page.goto('/');
    await expect(page).toHaveURL('/en');
    await page.goto('/en/create');
    await expect(page).toHaveURL('/en/sign-in');
    await accessible(page);
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});

test('HTTP locale negotiation, preference cookie and protected redirect', async ({
  request,
}) => {
  const negotiated = await request.get('/', {
    headers: { 'Accept-Language': 'tr' },
    maxRedirects: 0,
  });
  expect(negotiated.headers()['location']).toBe('/tr');
  const explicit = await request.get('/', {
    headers: { 'Accept-Language': 'tr', cookie: 'locale=en' },
    maxRedirects: 0,
  });
  expect(explicit.headers()['location']).toBe('/en');
  const protectedPage = await request.get('/en/home', { maxRedirects: 0 });
  expect(protectedPage.status()).toBe(307);
  expect(protectedPage.headers()['location']).toBe('/en/sign-in');
});
