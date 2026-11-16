import type { ExpoConfig } from 'expo/config';
const development = process.env.SONGSMITH_NATIVE_DEVELOPMENT === '1';
const config: ExpoConfig = {
  name: 'Songsmith',
  slug: 'songsmith',
  scheme: 'songsmith',
  version: '0.0.1',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.songsmith.app.dev',
    supportsTablet: true,
    infoPlist: {
      NSAppTransportSecurity: { NSAllowsLocalNetworking: development },
    },
  },
  android: { package: 'com.songsmith.app.dev' },
  plugins: [
    'expo-router',
    'expo-notifications',
    'expo-secure-store',
    'expo-localization',
    'expo-font',
    [
      'expo-dev-client',
      {
        launchMode: 'most-recent',
        showMenuAtLaunch: false,
        skipOnboarding: true,
      },
    ],
    [
      'expo-build-properties',
      { android: { usesCleartextTraffic: development } },
    ],
  ],
};
// SDK 58 / RN 0.88 use the New Architecture exclusively.
export default config;
