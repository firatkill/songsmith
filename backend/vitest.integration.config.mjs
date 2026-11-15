import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'backend-integration',
          include: ['test/integration/**/*.test.ts'],
          exclude: [
            'test/integration/**/*.isolated.test.ts',
            'test/integration/credits.test.ts',
          ],
          environment: 'node',
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: 'backend-integration-isolated',
          // Ledger discrepancy injection and the sweeper scan global database state.
          include: [
            'test/integration/**/*.isolated.test.ts',
            'test/integration/credits.test.ts',
          ],
          environment: 'node',
          sequence: { groupOrder: 1 },
          fileParallelism: false,
        },
      },
    ],
  },
});
