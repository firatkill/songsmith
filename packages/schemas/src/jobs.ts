import { z } from 'zod';
export const jobDataSchema = z.strictObject({
  jobId: z.uuid(),
  correlationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});
export type JobData = z.infer<typeof jobDataSchema>;
export const jobStateSchema = z
  .object({
    done: z.record(z.string(), z.json()).default({}),
  })
  .loose();
export const queueCatalogueSchema = z.array(
  z.object({ id: z.string(), adapter: z.string().regex(/^[a-zA-Z0-9_-]+$/) }),
);
export const queueFlagsSchema = z.array(
  z.object({ key: z.string(), value: z.json() }),
);
export const queueConcurrencySchema = z.number().int().positive().max(1000);
export const queueLimiterSchema = z.object({
  max: z.number().int().positive(),
  duration: z.number().int().positive(),
});

export const jobStepValueSchema = z.json();
export const recoveryRowsSchema = z.array(
  z.object({
    id: z.uuid(),
    status: z.enum(['queued', 'moderating', 'running', 'finishing']),
    heartbeat_at: z.iso.datetime({ offset: true }),
    model_id: z.string().nullable(),
    operation: z.string(),
    correlation_id: z.uuid().nullable(),
  }),
);
export const musicAdapterSchema = queueCatalogueSchema.element.pick({
  adapter: true,
});
