import tseslint from 'typescript-eslint';

export const boundaryIgnores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.turbo/**',
  '**/*.tsbuildinfo',
  '**/.codex-prompts/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.expo/**',
  '**/mobile/ios/**',
  '**/mobile/android/**',
];
const applications = {
  regex: '(^|/)(?:@songsmith/)?(?:frontend|backend|mobile)(?:/|$)',
  message: 'Shared packages cannot import applications.',
};
const backend = {
  regex: '(^|/)(?:@songsmith/)?backend(?:/|$)',
  message: 'Clients cannot import backend.',
};
// Pure packages use an explicit external dependency allow-list: new I/O libraries fail closed.
const pure = {
  regex:
    '^(?!\\.{1,2}/|#|zod(?:/|$)|intl-messageformat$|@songsmith/(?:domain|moderation-rules|schemas|i18n|ui-tokens)(?:/|$)|vitest(?:/|$)).+',
  message:
    'Pure packages cannot import Node built-ins or unapproved I/O libraries.',
};
const providers = {
  regex: '^(?:@google/genai|elevenlabs|@elevenlabs/[^/]+)(?:/|$)',
  message: 'Provider SDKs belong in backend/src/providers.',
};
const paddle = {
  regex: '^@paddle/paddle-node-sdk(?:/|$)',
  message: 'Paddle belongs in backend/src/payments/paddle.',
};
const revenuecat = {
  regex:
    '^(?:@revenuecat/[^/]+|react-native-purchases(?:-[^/]+)?|purchases-js)(?:/|$)',
  message: 'RevenueCat belongs in backend/src/payments/revenuecat.',
};
const extensions = '**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}';
function restricted(files, patterns, ignores = []) {
  return {
    files,
    ignores,
    rules: { 'no-restricted-imports': ['error', { patterns }] },
  };
}
// Each override contains the full applicable policy: ESLint replaces rule options.
export const boundaryConfig = [
  { files: [extensions], languageOptions: { parser: tseslint.parser } },
  restricted(['**/packages/**/' + extensions], [applications]),
  restricted(
    [
      '**/packages/{domain,moderation-rules,schemas,i18n,ui-tokens}/**/' +
        extensions,
    ],
    [applications, pure],
  ),
  restricted(['**/{frontend,mobile}/**/' + extensions], [backend]),
  restricted(
    ['**/backend/**/' + extensions],
    [providers, paddle, revenuecat],
    [
      '**/backend/src/providers/**',
      '**/backend/src/payments/paddle/**',
      '**/backend/src/payments/revenuecat/**',
    ],
  ),
  restricted(
    ['**/backend/src/providers/**/' + extensions],
    [paddle, revenuecat],
  ),
  restricted(
    ['**/backend/src/payments/paddle/**/' + extensions],
    [providers, revenuecat],
  ),
  restricted(
    ['**/backend/src/payments/revenuecat/**/' + extensions],
    [providers, paddle],
  ),
];
