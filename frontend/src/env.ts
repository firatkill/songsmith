import { z } from './lib/validation';
const httpUrl = z.url({ protocol: /^https?$/ });
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_API_URL: httpUrl.default('http://localhost:4000'),
});
export function publicEnv() {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  });
  if (!result.success)
    throw new Error(
      'Invalid public environment: ' +
        result.error.issues.map((issue) => issue.path.join('.')).join(', '),
    );
  return result.data;
}
