'use client';
import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '../env';
// Return only Auth: web application data always uses the generated API client.
export function browserAuth() {
  const env = publicEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ).auth;
}
