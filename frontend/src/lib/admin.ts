import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Locale } from '@songsmith/i18n';
import { publicEnv } from '../env';
import { api } from './api';
import { ApiFailure, apiErrorCode } from './errors';

// Server-side admin session. The API is the authority (staff role + AAL2); the
// AAL read here only decides whether to send the user to the MFA step first.
export const adminSession = cache(async (locale: Locale) => {
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
  if (!session) return { state: 'signed-out' as const };
  const level = await auth.mfa.getAuthenticatorAssuranceLevel();
  if (level.error || level.data.currentLevel !== 'aal2')
    return { state: 'needs-mfa' as const };
  const token = session.access_token;
  const client = api(locale, () => token);
  const whoami = await client.GET('/v1/admin/whoami', { cache: 'no-store' });
  if (whoami.error) {
    const code = apiErrorCode(whoami.error);
    if (code === 'FORBIDDEN' || code === 'NOT_ADULT')
      return { state: 'forbidden' as const };
    if (code === 'UNAUTHENTICATED') return { state: 'signed-out' as const };
    throw new ApiFailure(code);
  }
  return { state: 'staff' as const, client, roles: whoami.data.roles };
});
