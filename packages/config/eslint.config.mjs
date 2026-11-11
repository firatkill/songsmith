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
  // Supabase emits generic helpers with `never` unions when a schema has no views.
  // Keep all other strict checks on the generated database types.
  {
    files: ['**/schemas/src/db.types.ts'],
    rules: { '@typescript-eslint/no-redundant-type-constituents': 'off' },
  },
  {
    files: ['**/backend/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(trace|debug|info|warn|error|fatal)$/] MemberExpression[object.name=/^(req|request)$/][property.name='body']",
          message: 'SEC-11: never pass request bodies to logger calls.',
        },
      ],
    },
  },
  ...boundaryConfig,
];
