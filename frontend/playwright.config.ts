import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 3000 },
  workers: 4,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'parallel',
      fullyParallel: true,
      workers: 4,
      grepInvert: /@isolated/,
    },
    {
      name: 'isolated',
      dependencies: ['parallel'],
      workers: 1,
      grep: /@isolated/,
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @songsmith/backend start',
      url: 'http://localhost:4000/v1/health',
      reuseExistingServer: false,
      env: { APP_ENV: 'ci', PROVIDER_MODE: 'mock' },
    },
    {
      command: 'pnpm build && pnpm start',
      url: 'http://localhost:3000/en',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
