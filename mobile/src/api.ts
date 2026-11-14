import { createApiClient } from '@songsmith/api-client';
import type { Locale } from '@songsmith/i18n';
import { auth, env } from './auth/client';
export function api(locale: Locale) {
  return createApiClient({
    baseUrl: env.apiUrl,
    locale,
    getAccessToken: async () =>
      (await auth.getSession()).data.session?.access_token,
  });
}
