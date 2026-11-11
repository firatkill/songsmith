import { DelayedError, UnrecoverableError } from 'bullmq';
import {
  jobDataSchema,
  jobStateSchema,
  jobStepValueSchema,
  type JobData,
  type Json,
} from '@songsmith/schemas';
import type { Service } from '../lib/auth.js';
export interface StepJob {
  data: JobData;
  token?: string;
  moveToDelayed(timestamp: number, token?: string): Promise<void>;
}
export interface StepStore {
  load(id: string): Promise<unknown>;
  touch(id: string, stage: string): Promise<void>;
  save: (id: string, step: string, value: Json) => Promise<void>;
}
export interface Step {
  name: string;
  run(
    state: { done: Record<string, Json> },
    job: StepJob,
  ): Promise<{ kind: 'done'; value: Json } | { kind: 'wait'; ms: number }>;
}
export function stepStore(service: Service): StepStore {
  return {
    async load(id) {
      const r = await service()
        .from('generation_jobs')
        .select('steps')
        .eq('id', id)
        .single();
      if (r.error) throw new Error('Job state unavailable');
      return r.data.steps;
    },
    async touch(id, stage) {
      const r = await service()
        .schema('app')
        .rpc('touch_job', { job_id: id, stage_detail: stage });
      if (r.error) throw new Error('Job heartbeat failed');
    },
    async save(id, step, value) {
      const r = await service()
        .schema('app')
        .rpc('save_job_step', { job_id: id, step, value });
      if (r.error) throw new Error('Job persistence failed');
    },
  };
}
export async function runSteps(job: StepJob, steps: Step[], store: StepStore) {
  const { jobId } = jobDataSchema.parse(job.data);
  const state = jobStateSchema.parse(await store.load(jobId));
  for (const step of steps) {
    if (Object.hasOwn(state.done, step.name)) continue;
    await store.touch(jobId, step.name);
    try {
      const result = await step.run(state, job);
      if (result.kind === 'wait') {
        if (!Number.isSafeInteger(result.ms) || result.ms <= 0)
          throw new UnrecoverableError('Invalid polling delay');
        await job.moveToDelayed(Date.now() + result.ms, job.token);
        throw new DelayedError();
      }
      const value = jobStepValueSchema.parse(result.value);
      await store.save(jobId, step.name, value);
      state.done[step.name] = value;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'retryable' in error &&
        error.retryable === false
      )
        throw new UnrecoverableError('Non-retryable job failure');
      throw error;
    }
  }
}
