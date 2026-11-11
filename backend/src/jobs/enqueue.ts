import { jobDataSchema } from '@songsmith/schemas';
import type { JobQueue } from './queues.js';
export async function enqueue(
  queue: JobQueue,
  name: string,
  data: unknown,
  options: { jobId: string },
) {
  const parsed = jobDataSchema.parse(data);
  if (parsed.jobId !== options.jobId) throw new Error('Job ID mismatch');
  return queue.add(name, parsed, { jobId: options.jobId });
}
