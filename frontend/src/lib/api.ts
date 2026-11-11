import { createApiClient } from '@songsmith/api-client';
import type { Locale } from '@songsmith/i18n';
import { publicEnv } from '../env';
export function api(
  locale: Locale,
  getAccessToken: () => string | undefined | Promise<string | undefined>,
) {
  return createApiClient({
    baseUrl: publicEnv().NEXT_PUBLIC_API_URL,
    locale,
    getAccessToken,
  });
}
