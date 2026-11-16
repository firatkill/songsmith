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
// T-20: Realtime is only a change signal; the page re-reads data through the API.
export function browserRealtime() {
  const env = publicEnv();
  const client = createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return {
    onNotificationsChange(userId: string, changed: () => void) {
      const channel = client
        .channel(`notifications:${userId}:${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          changed,
        )
        .subscribe();
      return () => {
        void client.removeChannel(channel);
      };
    },
    onJobChange(jobId: string, changed: () => void) {
      const channel = client
        .channel(`job:${jobId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'generation_jobs',
            filter: `id=eq.${jobId}`,
          },
          changed,
        )
        .subscribe();
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
