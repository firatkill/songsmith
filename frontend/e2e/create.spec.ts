import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { accessToken, onboard } from './helpers';

const API = 'http://localhost:4000';
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter(
      (item) => item.impact === 'serious' || item.impact === 'critical',
    ),
  ).toEqual([]);
}
async function toReady(page: Page) {
  await expect(page).toHaveURL(/\/en\/create\/jobs\/[0-9a-f-]{36}$/u);
  await accessible(page);
  // The song is a background job (worker + mock provider), not a UI wait.
  await expect
    .poll(() => page.getByTestId('job-status').getAttribute('data-status'), {
      timeout: 45_000,
    })
    .toBe('ready');
  await expect(page.getByTestId('job-status')).toHaveText('Your song is ready');
}
async function generate(page: Page, price = 10) {
  const button = page.getByRole('button', {
    name: `Generate · ${String(price)} credits`,
  });
  // The free moderation pre-check runs ~0.8 s after the step opens.
  await expect(page.getByText('Ready to generate.')).toBeVisible({
    timeout: 10_000,
  });
  await expect(button).toBeEnabled();
  await button.click();
}

test('E2E-10 describe → lyrics → edit, rewrite, undo → style → generate → ready', async ({
  page,
  request,
}) => {
  await onboard(page, request);
  await page.goto('/en/create');
  await accessible(page);
  await page
    .getByLabel('Describe your song')
    .fill('A cheerful song about a summer road trip with friends');
  await page.getByRole('button', { name: 'Write lyrics · 1 credit' }).click();
  await expect(
    page.getByRole('heading', { name: 'Edit your lyrics' }),
  ).toBeVisible({ timeout: 15_000 });
  await accessible(page);
  const first = page.getByLabel('Lines of section 1', { exact: true });
  const marker = `Edited line ${randomUUID().slice(0, 8)}`;
  await first.fill(marker);
  await page.getByRole('button', { name: 'Rewrite section 1' }).click();
  const dialog = page.getByTestId('rewrite-dialog');
  await expect(dialog.getByRole('heading')).toHaveText('Rewrite this section');
  await dialog.getByLabel('Instruction (optional)').fill('make it brighter');
  await dialog.getByRole('button', { name: 'Rewrite · 1 credit' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(first).not.toHaveValue(marker);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(first).toHaveValue(marker);
  await page.getByRole('button', { name: 'Move section 2 up' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(first).toHaveValue(marker);
  // Reloading keeps the draft (sessionStorage, FR-01).
  await page.reload();
  await expect(first).toHaveValue(marker);
  await page.getByRole('button', { name: 'Continue to sound' }).click();
  await expect(page.getByLabel('Song title')).not.toHaveValue('');
  await page.getByRole('radio', { name: 'Pop', exact: true }).check();
  await page.getByLabel('Mood').selectOption('happy');
  await expect(
    page.getByText('This model does not support an exact BPM.'),
  ).toBeVisible();
  await accessible(page);
  await generate(page);
  await toReady(page);
});

test('E2E-11 my lyrics with missing tags: proposal accepted, words unchanged', async ({
  page,
  request,
}) => {
  await onboard(page, request);
  await page.goto('/en/create');
  await page.getByText('My lyrics', { exact: true }).click();
  const chorus = 'We sing along the coast tonight';
  await page
    .getByLabel('Paste your lyrics')
    .fill(
      `Morning light on the water\nWe pack the car\n\n${chorus}\n\nRoads that bend and wander\n\n${chorus}`,
    );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Add section tags?' }),
  ).toBeVisible();
  await expect(page.getByText('Suggested tag')).toHaveCount(4);
  await accessible(page);
  await page.getByRole('button', { name: 'Add tags', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Edit your lyrics' }),
  ).toBeVisible();
  await expect(page.getByTestId('section-2').getByRole('combobox')).toHaveValue(
    '[Chorus]',
  );
  await expect(
    page.getByLabel('Lines of section 1', { exact: true }),
  ).toHaveValue('Morning light on the water\nWe pack the car');
  await page.getByRole('button', { name: 'Continue to sound' }).click();
  await page.getByLabel('Song title').fill(`Coast ${randomUUID().slice(0, 6)}`);
  await generate(page);
  await toReady(page);
});

test('E2E-12 a Turkish song routes to mock-music-b; A shows language not verified', async ({
  page,
  request,
}) => {
  await onboard(page, request);
  await page.goto('/en/create');
  await page.getByLabel('Song language').selectOption('tr');
  await page
    .getByLabel('Describe your song')
    .fill('Arkadaşlarımla yaptığımız yaz yolculuğu hakkında neşeli bir şarkı');
  await page.getByRole('button', { name: 'Write lyrics · 1 credit' }).click();
  await expect(
    page.getByRole('heading', { name: 'Edit your lyrics' }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Continue to sound' }).click();
  await page
    .locator('summary', { hasText: 'Advanced: choose a model' })
    .click();
  const a = page.getByTestId('model-mock-music-a');
  await expect(a).toContainText(
    'This language is not verified for this model.',
  );
  await expect(a.getByRole('radio')).toBeDisabled();
  await expect(page.getByText('Auto will use mock-music-b.')).toBeVisible();
  await accessible(page);
  await generate(page);
  await toReady(page);
  await expect(page.getByTestId('job-model')).toHaveAttribute(
    'data-model',
    'mock-music-b',
  );
});

test('E2E-13 blocked input shows the category and keeps Generate disabled', async ({
  page,
  request,
}) => {
  await onboard(page, request);
  await page.goto('/en/create');
  // The lyricist refuses blocked input before spending anything.
  await page.getByLabel('Describe your song').fill('A song ⟦mock:hate⟧');
  await page.getByRole('button', { name: 'Write lyrics · 1 credit' }).click();
  await expect(page.getByText('Please remove hateful content.')).toBeVisible({
    timeout: 10_000,
  });
  // Instrumental reaches the style step, where the pre-check blocks Generate.
  await page.getByRole('switch', { name: /Instrumental/u }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Song title').fill('Blocked');
  const alert = page.locator('.create-block');
  await expect(alert).toContainText('Please remove hateful content.', {
    timeout: 10_000,
  });
  await expect(
    page.getByRole('button', { name: /^Generate · / }),
  ).toBeDisabled();
  await accessible(page);
  await alert.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByLabel('Describe your song')).toHaveValue(
    'A song ⟦mock:hate⟧',
  );
});

test('E2E-14 insufficient credits opens the buy sheet', async ({
  page,
  request,
}) => {
  await onboard(page, request);
  const headers = {
    Authorization: `Bearer ${await accessToken(page)}`,
    'Content-Type': 'application/json',
  };
  // 30 sign-up credits − one lyric (1) − two songs (2 × 10) leaves 9 < 10.
  const lyric = await request.post(`${API}/v1/lyrics/write`, {
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
    data: { language: 'en', description: 'A calm song about rain' },
    // The mock lyricist answers after its simulated model latency.
    timeout: 20_000,
  });
  expect(lyric.status()).toBe(200);
  for (let i = 0; i < 2; i++) {
    const song = await request.post(`${API}/v1/songs`, {
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      data: {
        title: `Rain ${String(i)}`,
        language: 'en',
        instrumental: true,
        description: 'Calm piano and rain',
        durationSec: 30,
      },
      timeout: 20_000,
    });
    expect(song.status()).toBe(202);
  }
  await page.goto('/en/create');
  await page.getByRole('switch', { name: /Instrumental/u }).check();
  await page.getByLabel('Describe your song').fill('Calm piano and rain');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Song title').fill('Rain again');
  await expect(page.getByText('You have 9 credits available.')).toBeVisible();
  await page.getByRole('button', { name: 'Buy credits' }).click();
  const sheet = page.getByTestId('buy-sheet');
  await expect(sheet.getByRole('heading')).toHaveText('Not enough credits');
  await expect(sheet).toContainText(
    'This song needs 10 credits and you have 9 credits.',
  );
  await expect(sheet).toContainText('Credit packs are coming soon.');
  await accessible(page);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: 'Buy credits' })).toBeFocused();
});
