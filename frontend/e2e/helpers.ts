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
