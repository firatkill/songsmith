import { z } from 'zod';

const inputSchema = z.object({
  platform: z.enum(['ios', 'android']),
  physicalDevice: z.boolean(),
  devHost: z
    .string()
    .regex(/^[a-zA-Z0-9.-]+$/)
    .optional(),
  apiUrl: z.url().optional(),
  supabaseUrl: z.url().default('http://localhost:54321'),
  anonKey: z.string().min(1),
});
/** Pure: native detection and Expo's statically inlined variables live at the call site. */
export function resolveEnv(input: z.input<typeof inputSchema>) {
  const value = inputSchema.parse(
    Object.fromEntries(
      Object.entries(input).filter(
        ([, value]) => typeof value !== 'string' || value.trim() !== '',
      ),
    ),
  );
  const host = value.physicalDevice
    ? value.devHost
    : value.platform === 'android'
      ? '10.0.2.2'
      : 'localhost';
  if (!host)
    throw new Error('EXPO_PUBLIC_DEV_HOST is required for physical devices');
  const supabase = new URL(value.supabaseUrl);
  if (['localhost', '127.0.0.1', '10.0.2.2'].includes(supabase.hostname))
    supabase.hostname = host;
  return z
    .object({
      apiUrl: z.url(),
      supabaseUrl: z.url(),
      anonKey: z.string().min(1),
    })
    .parse({
      apiUrl: value.apiUrl ?? `http://${host}:4000`,
      supabaseUrl: supabase.toString().replace(/\/$/, ''),
      anonKey: value.anonKey,
    });
}
