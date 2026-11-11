import { z } from 'zod';
export const healthResponseSchema = z.strictObject({
  status: z.literal('ok'),
  version: z.string(),
  env: z.enum(['local', 'ci', 'production']),
  providerMode: z.enum(['mock', 'live']),
});
