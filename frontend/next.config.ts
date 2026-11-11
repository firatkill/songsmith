import type { NextConfig } from 'next';
import { publicEnv } from './src/env';
const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: [
    '@songsmith/i18n',
    '@songsmith/ui-tokens',
    '@songsmith/schemas',
    '@songsmith/api-client',
  ],
};
export default function nextConfig(phase: string): NextConfig {
  // Static checks can build without credentials; running servers fail closed at startup.
  if (phase !== 'phase-production-build') publicEnv();
  return config;
}
