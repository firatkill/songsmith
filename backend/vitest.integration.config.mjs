import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'backend-integration',
          include: ['test/integration/**/*.test.ts'],
          exclude: ['test/integration/**/*.isolated.test.ts'],
          environment: 'node',
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: 'backend-integration-isolated',
          include: ['test/integration/**/*.isolated.test.ts'],
          environment: 'node',
          sequence: { groupOrder: 1 },
          fileParallelism: false,
        },
      },
    ],
  },
});
