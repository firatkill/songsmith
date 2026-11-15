import shared from '../packages/config/eslint.config.mjs';
import next from '@next/eslint-plugin-next';
import tseslint from 'typescript-eslint';
export default [
  ...shared,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@next/next': next },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // The MFA QR code is a small SVG data URI from Supabase Auth; next/image adds
    // nothing for it and fails on it in development.
    files: ['src/components/admin/mfa-form.tsx'],
    rules: { '@next/next/no-img-element': 'off' },
  },
];
