import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { accessToken, onboard } from './helpers';
test('E2E-15 notification and badge update live; opening marks read; settings persist', async ({
  page,
  request,
}) => {
  await onboard(page, request);
  await page.goto('/en/notifications');
  await expect(
    page.getByRole('heading', { name: 'You’re all caught up' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Notifications, 0 unread' }),
  ).toBeVisible();
  const token = await accessToken(page),
    title = `Live song ${randomUUID().slice(0, 8)}`;
  const result = await request.post('http://localhost:4000/v1/songs', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': randomUUID(),
    },
    data: {
      title,
      description: 'Calm piano',
      language: 'en',
      instrumental: true,
      durationSec: 30,
    },
  });
  expect(result.status()).toBe(202);
  // The worker completes in the background; no navigation or reload is used.
  await expect
    .poll(() => page.getByRole('button', { name: new RegExp(title) }).count(), {
      timeout: 45000,
    })
    .toBe(1);
  await expect(
    page.getByRole('link', { name: 'Notifications, 1 unread' }),
  ).toBeVisible();
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(/\/en\/create\/jobs\//u);
  await expect(
    page.getByRole('link', { name: 'Notifications, 0 unread' }),
  ).toBeVisible();
  await page.goto('/en/settings');
  await page
    .getByRole('switch', { name: 'E-mail when a song is ready', exact: true })
    .check();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByRole('status')).toContainText('Preferences saved.');
  await page.reload();
  await expect(
    page.getByRole('switch', {
      name: 'E-mail when a song is ready',
      exact: true,
    }),
  ).toBeChecked();
});
