import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const workspaces = [
  'frontend',
  'backend',
  'mobile',
  'remotion',
  'eval',
  'packages/schemas',
  'packages/api-client',
  'packages/domain',
  'packages/moderation-rules',
  'packages/i18n',
  'packages/ui-tokens',
  'packages/config',
];

export default defineConfig({
  test: {
    projects: workspaces.map((workspace) => ({
      test: {
        name: `@songsmith/${workspace.split('/').at(-1)}`,
        root: fileURLToPath(new URL(`./${workspace}/`, import.meta.url)),
        environment: 'node',
        include: ['src/**/*.test.ts'],
      },
    })),
  },
});
