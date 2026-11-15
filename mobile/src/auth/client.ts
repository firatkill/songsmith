import { Platform } from 'react-native';
import { isDevice } from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { z } from '../validation';
import { resolveEnv } from '../env';
import { chunkedStorage } from './storage';
export const env = resolveEnv({
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  physicalDevice: isDevice,
  ...(z.string().optional().parse(process.env.EXPO_PUBLIC_DEV_HOST)
    ? { devHost: z.string().optional().parse(process.env.EXPO_PUBLIC_DEV_HOST) }
    : {}),
  ...(z.string().optional().parse(process.env.EXPO_PUBLIC_API_URL)
    ? { apiUrl: z.string().optional().parse(process.env.EXPO_PUBLIC_API_URL) }
    : {}),
  supabaseUrl:
    z.string().optional().parse(process.env.EXPO_PUBLIC_SUPABASE_URL) ??
    'http://localhost:54321',
  anonKey:
    z.string().optional().parse(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ??
    '',
});
// Export auth only: data access always uses the backend API.
export const auth = createClient(env.supabaseUrl, env.anonKey, {
  auth: {
    storage: chunkedStorage(SecureStore),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
}).auth;
