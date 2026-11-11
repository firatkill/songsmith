import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'backend-integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
