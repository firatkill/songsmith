import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { meResponseSchema } from './validation';
import type { Locale } from '@songsmith/i18n';
import { publicEnv } from '../env';
import { api } from './api';
import { ApiFailure, apiErrorCode } from './errors';
import { onboardingPath } from './locale';
export const currentMe = cache(async (locale: Locale) => {
  const env = publicEnv();
  const jar = await cookies();
  const auth = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: () => {
          /* Proxy owns refresh cookie writes. */
        },
      },
    },
  ).auth;
  const {
    data: { session },
  } = await auth.getSession();
  if (!session) return null;
  // The API verifies the JWT and profile status; cookie contents alone never authorize a page.
  const result = await api(locale, () => session.access_token).GET('/v1/me', {
    cache: 'no-store',
  });
  if (result.error) {
    if (apiErrorCode(result.error) === 'UNAUTHENTICATED') return null;
    throw new ApiFailure(apiErrorCode(result.error));
  }
  return meResponseSchema.parse(result.data);
});
export async function requireStage(
  locale: Locale,
  stage: 'home' | 'age-gate' | 'consent',
) {
  const me = await currentMe(locale);
  const destination = onboardingPath(locale, me);
  if (destination !== `/${locale}/${stage}`) redirect(destination);
  if (!me) redirect(`/${locale}/sign-in`);
  return me;
}
