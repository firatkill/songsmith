import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@songsmith/schemas';
import type { Env } from '../lib/env.js';
export function lazyServiceClient(env: Env): () => SupabaseClient<Database> {
  let client: SupabaseClient<Database> | undefined;
  return () =>
    (client ??= createClient<Database>(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    ));
}
