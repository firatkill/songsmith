import js from '@eslint/js';
import { boundaryConfig } from './boundaries.mjs';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      '**/fixtures/boundaries/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/.expo/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/playwright/.cache/**',
      '**/.codex-prompts/**',
      '**/mobile/ios/**',
      '**/mobile/android/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 10,
        },
      ],
    },
  },
  ...boundaryConfig,
];
