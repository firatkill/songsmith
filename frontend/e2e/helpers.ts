import { randomUUID } from 'node:crypto';
import { expect, type Page, type APIRequestContext } from '@playwright/test';
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
export async function signIn(page: Page, request: APIRequestContext) {
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
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page).toHaveURL('/en/age-gate');
  return email;
}
// Sign-in, adult age gate and the required consents (T-20 flows start at home).
export async function onboard(page: Page, request: APIRequestContext) {
  const email = await signIn(page, request);
  await page.getByLabel('Day', { exact: true }).fill('1');
  await page.getByLabel('Month', { exact: true }).fill('1');
  await page.getByLabel('Year', { exact: true }).fill('1990');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL('/en/consent');
  for (const name of ['Terms of service', 'Privacy notice', 'AI data use'])
    await page.getByLabel(name, { exact: true }).check();
  await page
    .getByRole('button', { name: 'Accept and continue', exact: true })
    .click();
  await expect(page).toHaveURL('/en/home');
  return email;
}
const sessionCookie = z.object({ access_token: z.string().min(1) });
// The browser session's access token, for setting up state through the API.
export async function accessToken(page: Page) {
  const cookies = (await page.context().cookies())
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/u.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  const raw = cookies.map((c) => c.value).join('');
  const json = raw.startsWith('base64-')
    ? Buffer.from(raw.slice(7), 'base64url').toString('utf8')
    : decodeURIComponent(raw);
  return sessionCookie.parse(JSON.parse(json)).access_token;
}
