import { createNotify, notifySong, type Notify } from '../notify/index.js';
import { DelayedError, UnrecoverableError } from 'bullmq';
import { route } from '@songsmith/domain';
import {
  jobDataSchema,
  songJobRowSchema,
  type CatalogueModel,
  type Json,
  type SongJobRow,
} from '@songsmith/schemas';
import type { Service } from '../lib/auth.js';
import type { Logger } from '../lib/log.js';
import { storePrivate, songAssetPath } from '../media/storage.js';
import { tagMp3 } from '../media/tags.js';
import type { createRegistry } from '../models/registry.js';
import { ProviderError } from '../providers/errors.js';
import type {
  AudioOutput,
  MusicAdapter,
  ProviderContext,
  StartResult,
} from '../providers/types.js';
import {
  runSteps,
  stepStore,
  type StepJob,
  type StepStore,
} from '../jobs/steps.js';

type Registry = Pick<
  Awaited<ReturnType<typeof createRegistry>>,
  'catalogue' | 'adapter' | 'usableModels'
>;
export interface GenerateDeps {
  service: Service;
  models: () => Promise<Registry>;
  logger: Pick<Logger, 'info' | 'warn'>;
  store?: StepStore;
  notify?: Notify;
}
export interface GenerateJob extends StepJob {
  attemptsMade?: number;
  opts?: { attempts?: number };
}

async function loadJob(service: Service, id: string): Promise<SongJobRow> {
  const result = await service()
    .from('generation_jobs')
    .select(
      'id,user_id,operation,status,song_id,model_id,route_reason,reservation_id,error_code,stage_detail,steps',
    )
    .eq('id', id)
    .single();
  if (result.error) throw new Error('Job unavailable');
  return songJobRowSchema.parse(result.data);
}
async function reservedAmount(service: Service, reservationId: string) {
  const result = await service()
    .schema('app')
    .from('credit_reservations')
    .select('amount')
    .eq('id', reservationId)
    .single();
  if (result.error) throw new Error('Reservation unavailable');
  return result.data.amount;
}
async function artistName(service: Service, userId: string) {
  const result = await service()
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .single();
  if (result.error) throw new Error('Profile unavailable');
  return result.data.display_name;
}
async function collect(bytes: AudioOutput['bytes']) {
  if (bytes instanceof Uint8Array) return bytes;
  const chunks: Uint8Array[] = [];
  for await (const chunk of bytes) chunks.push(chunk);
  return new Uint8Array(Buffer.concat(chunks));
}
function isMusic(adapter: unknown): adapter is MusicAdapter {
  return !!adapter && typeof adapter === 'object' && 'generate' in adapter;
}

/**
 * FR-29: re-check eligibility when the job runs. A manual or unavailable
 * choice fails; Auto may fall back, but only to a model whose price is at
 * most the reserved amount. The job records both models.
 */
export function pickModel(input: {
  job: SongJobRow;
  models: CatalogueModel[];
  reserved: number;
}): { modelId: string; fallbackFrom?: string } | { error: string } {
  const request = input.job.steps.request;
  const current = input.job.model_id;
  if (!request || !current) return { error: 'INTERNAL' };
  const manual = input.job.route_reason['kind'] === 'manual';
  const base = {
    operation: 'generate' as const,
    language: request.instrumental ? null : request.language,
    instrumental: request.instrumental,
    allowBetaLanguages: false,
  };
  const again = route({
    ...base,
    models: input.models,
    requestedModelId: current,
  });
  if (again.ok) return { modelId: current };
  if (manual) return { error: 'MODEL_NOT_ELIGIBLE' };
  const fallback = route({
    ...base,
    models: input.models.filter(
      (m) =>
        m.id !== current && (m.prices.generate ?? Infinity) <= input.reserved,
    ),
  });
  return fallback.ok
    ? { modelId: fallback.modelId, fallbackFrom: current }
    : { error: 'NO_ELIGIBLE_MODEL' };
}

export function createGenerateSong(deps: GenerateDeps) {
  const store = deps.store ?? stepStore(deps.service);
  const notify =
    deps.notify ?? createNotify(deps.service, () => Promise.resolve());
  const emit = (id: string) =>
    notifySong(deps.service, notify, deps.logger, id);
  return async function generateSong(job: GenerateJob) {
    const { jobId, correlationId } = jobDataSchema.parse(job.data);
    const row = await loadJob(deps.service, jobId);
    if (['ready', 'failed', 'refunded', 'cancelled'].includes(row.status)) {
      await emit(jobId);
      return;
    }
    const ctx = (): ProviderContext => ({
      jobId,
      userId: row.user_id,
      correlationId,
      signal: AbortSignal.timeout(120_000),
    });
    const request = row.steps.request;
    let failure: string | undefined; // runSteps wraps non-retryable errors.
    const record = <T>(promise: Promise<T>) =>
      promise.catch((error: unknown) => {
        failure = errorCodeOf(error);
        throw error;
      });
    // Stores the audio as soon as it exists, so a retry never generates twice.
    const settleStart = async (
      result: StartResult<AudioOutput>,
      songId: string,
      modelId: string,
    ): Promise<StoredOrPending> => {
      if (result.kind === 'pending')
        return { kind: 'pending', taskId: result.taskId };
      const audio = await collect(result.output.bytes);
      const tagged = tagMp3(audio, {
        title: request?.title ?? '',
        artist: await artistName(deps.service, row.user_id),
        modelId,
      });
      const stored = await storePrivate(
        deps.service,
        songAssetPath(songId, 'audio.mp3'),
        tagged,
        'audio/mpeg',
      );
      return {
        kind: 'stored',
        durationMs: result.output.durationMs,
        ...stored,
      };
    };
    const fail = async (code: string) => {
      const result = await deps
        .service()
        .schema('app')
        .rpc('fail_song_job', { p_job_id: jobId, p_error_code: code });
      if (result.error) throw new Error('Job failure not recorded');
      deps.logger.warn({ jobId, errorCode: code }, 'song.failed');
      await emit(jobId);
    };
    try {
      if (row.status === 'queued') {
        const running = await deps
          .service()
          .from('generation_jobs')
          .update({ status: 'running' })
          .eq('id', jobId)
          .eq('status', 'queued');
        if (running.error) throw new Error('Job state not updated');
      }
      if (!request || !row.song_id || !row.reservation_id)
        throw new UnrecoverableError('Job not claimed');
      const songId = row.song_id;
      const reservationId = row.reservation_id;
      let modelId = row.model_id ?? '';
      const adapterFor = async (id: string) => {
        const registry = await deps.models();
        const model = (await registry.usableModels()).find((m) => m.id === id);
        const adapter = model ? registry.adapter(model.adapter) : undefined;
        if (!isMusic(adapter)) throw new ProviderError('unavailable', true);
        return adapter;
      };
      await runSteps(
        job,
        [
          {
            name: 'route',
            run: async () => {
              const registry = await deps.models();
              const picked = pickModel({
                job: row,
                models: await registry.catalogue('generate'),
                reserved: await reservedAmount(deps.service, reservationId),
              });
              if ('error' in picked) {
                failure = picked.error;
                throw new UnrecoverableError('Model not eligible');
              }
              if (picked.fallbackFrom) {
                const updated = await deps
                  .service()
                  .from('generation_jobs')
                  .update({
                    model_id: picked.modelId,
                    route_reason: {
                      ...row.route_reason,
                      fallbackFrom: picked.fallbackFrom,
                    },
                  })
                  .eq('id', jobId);
                if (updated.error) throw new Error('Route not saved');
              }
              return { kind: 'done', value: picked as Json };
            },
          },
          {
            name: 'provider_start',
            run: async (state) => {
              modelId =
                (state.done['route'] as { modelId?: string } | undefined)
                  ?.modelId ?? modelId;
              const adapter = await adapterFor(modelId);
              const cap = adapter.capabilities();
              const result = await record(
                adapter.generate(
                  {
                    description: request.description,
                    ...(request.instrumental ? {} : { lyrics: request.lyrics }),
                    language: request.language,
                    durationSec: Math.min(
                      cap.maxDurationSec,
                      Math.max(cap.minDurationSec, request.durationSec),
                    ),
                    format: 'mp3',
                    instrumental: request.instrumental,
                    ...(request.style ? { style: request.style } : {}),
                  },
                  ctx(),
                ),
              );
              return {
                kind: 'done',
                value: (await settleStart(
                  result,
                  songId,
                  modelId,
                )) as unknown as Json,
              };
            },
          },
          {
            name: 'provider_poll',
            run: async (state) => {
              const started = state.done['provider_start'] as StoredOrPending;
              if (started.kind === 'stored')
                return { kind: 'done', value: started as unknown as Json };
              const adapter = await adapterFor(modelId);
              if (!adapter.poll) throw new ProviderError('unknown', false);
              const result = (await record(
                adapter.poll(started.taskId, ctx()),
              )) as StartResult<AudioOutput>;
              if (result.kind === 'pending')
                return { kind: 'wait', ms: result.pollAfterMs };
              return {
                kind: 'done',
                value: (await settleStart(
                  result,
                  songId,
                  modelId,
                )) as unknown as Json,
              };
            },
          },
          {
            name: 'complete',
            run: async (state) => {
              const stored = state.done['provider_poll'] as Stored;
              const completed = await deps
                .service()
                .schema('app')
                .rpc('complete_song_job', {
                  p_job_id: jobId,
                  p_model_id: modelId,
                  p_duration_ms: stored.durationMs,
                  p_assets: [
                    {
                      kind: 'audio_mp3',
                      label: null,
                      bucket: stored.bucket,
                      path: stored.path,
                      bytes: stored.bytes,
                      sha256: stored.sha256,
                    },
                  ],
                });
              if (completed.error) throw new Error('Song not completed');
              deps.logger.info({ jobId, songId, modelId }, 'song.ready');
              return { kind: 'done', value: true };
            },
          },
        ],
        store,
      );
      // A notification or step-persistence failure never retries a song.
      await emit(jobId);
      await store.save(jobId, 'notify', true).catch(() => {
        deps.logger.warn(
          { jobId, errorCode: 'INTERNAL' },
          'notification.step_failed',
        );
      });
    } catch (error) {
      if (error instanceof DelayedError) throw error;
      const notRetryable =
        typeof error === 'object' &&
        error !== null &&
        'retryable' in error &&
        error.retryable === false;
      const lastAttempt =
        (job.attemptsMade ?? 0) + 1 >= (job.opts?.attempts ?? 1);
      const final =
        error instanceof UnrecoverableError || notRetryable || lastAttempt;
      if (final) {
        await fail(failure ?? errorCodeOf(error));
        throw new UnrecoverableError('Song generation failed');
      }
      throw error;
    }
  };
}
type Stored = {
  kind: 'stored';
  durationMs: number;
  bucket: string;
  path: string;
  bytes: number;
  sha256: string;
};
type StoredOrPending = Stored | { kind: 'pending'; taskId: string };

function errorCodeOf(error: unknown) {
  if (error instanceof ProviderError)
    return error.code === 'timeout' ? 'PROVIDER_TIMEOUT' : 'INTERNAL';
  return 'INTERNAL';
}
