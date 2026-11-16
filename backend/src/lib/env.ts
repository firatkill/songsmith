import { z } from 'zod';
const flag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');
const schema = z
  .object({
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('Songsmith <notifications@songsmith.local>'),
    EXPO_ACCESS_TOKEN: z.string().optional(),
    SMTP_HOST: z.string().default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(54325),
    PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
    APP_ENV: z.enum(['local', 'ci', 'production']).default('local'),
    PROVIDER_MODE: z.enum(['mock', 'live']).default('mock'),
    MOCK_LATENCY_MS: z.coerce.number().int().min(0).max(300000).default(3000),
    MOCK_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
    ALLOW_MOCK_IN_PRODUCTION: flag,
    ALLOW_LIVE_PROVIDERS: flag,
    SUPABASE_URL: z.url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SUPABASE_JWT_ISSUER: z.url().optional(),
    REDIS_URL: z
      .url()
      .refine((v) => ['redis:', 'rediss:'].includes(new URL(v).protocol))
      .optional(),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    WEB_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((v) => v.split(',').map((x) => x.trim()))
      .pipe(z.array(z.url().refine((v) => new URL(v).origin === v)).min(1)),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  })
  .superRefine((v, ctx) => {
    if (v.APP_ENV === 'production' && !v.REDIS_URL)
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'required in production',
      });
    if (
      v.APP_ENV === 'production' &&
      v.PROVIDER_MODE === 'mock' &&
      !v.ALLOW_MOCK_IN_PRODUCTION
    )
      ctx.addIssue({
        code: 'custom',
        path: ['PROVIDER_MODE'],
        message: 'production mock requires ALLOW_MOCK_IN_PRODUCTION=true',
      });
    if (
      v.APP_ENV !== 'production' &&
      v.PROVIDER_MODE === 'live' &&
      !v.ALLOW_LIVE_PROVIDERS
    )
      ctx.addIssue({
        code: 'custom',
        path: ['PROVIDER_MODE'],
        message: 'local/ci live requires ALLOW_LIVE_PROVIDERS=true',
      });
  })
  .transform((v) => ({
    ...v,
    REDIS_URL: v.REDIS_URL ?? 'redis://localhost:6379',
    SUPABASE_JWT_ISSUER:
      v.SUPABASE_JWT_ISSUER ?? `${v.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`,
  }));
export type Env = z.infer<typeof schema>;
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(
    Object.fromEntries(
      Object.entries(source).filter(([, value]) => value?.trim() !== ''),
    ),
  );
  if (!result.success)
    throw new Error(
      `Invalid environment keys: ${[...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', ')}. Check environment configuration and provider overrides.`,
    );
  return result.data;
}
