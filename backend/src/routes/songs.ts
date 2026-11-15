import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  idempotencyHeadersSchema,
  jobResponseSchema,
  songCreateRequestSchema,
  songJobRowSchema,
  type JobResponse,
  type SongJobRow,
} from '@songsmith/schemas';
import { route, serialiseLyrics } from '@songsmith/domain';
import { caller, requireConsent, type Service } from '../lib/auth.js';
import { requestContext } from '../lib/correlation.js';
import { AppError } from '../lib/errors.js';
import type { FlagService } from '../lib/flags.js';
import { defineRoute, type RouteContext } from '../lib/route.js';
import { creditRpcResult, startJob } from '../credits/ledger.js';
import type { Enqueue } from '../jobs/producer.js';
import type { createRegistry } from '../models/registry.js';
import {
  requireModerationAccount,
  type createModeration,
} from '../moderation/pipeline.js';
import { bodyHash } from './lyrics.js';

type Models = () => Promise<
  Pick<Awaited<ReturnType<typeof createRegistry>>, 'catalogue' | 'usableModels'>
>;
const requireAiDisclosure = requireConsent('ai_disclosure');
const JOB_COLUMNS =
  'id,user_id,operation,status,song_id,model_id,route_reason,reservation_id,error_code,stage_detail,steps';

export function jobResponse(row: SongJobRow): JobResponse {
  return jobResponseSchema.parse({
    jobId: row.id,
    songId: row.song_id,
    operation: row.operation,
    status: row.status,
    stageDetail: row.stage_detail,
    modelId: row.model_id,
    routeReason: row.route_reason,
    errorCode: row.error_code,
  });
}
const uuid = z.uuid();

export function registerSongs(
  context: RouteContext,
  deps: {
    service: Service;
    flags: Pick<FlagService, 'getFlag' | 'killSwitch'>;
    models: Models;
    moderate: ReturnType<typeof createModeration>;
    enqueue: Enqueue;
    logger: { warn: (obj: object, msg: string) => void };
  },
) {
  const { service } = deps;
  async function jobByKey(userId: string, key: string) {
    const result = await service()
      .from('generation_jobs')
      .select(JOB_COLUMNS)
      .eq('user_id', userId)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (result.error) throw new AppError('INTERNAL');
    return result.data ? songJobRowSchema.parse(result.data) : undefined;
  }
  function replay(row: SongJobRow, hash: string) {
    if (row.operation !== 'generate' || row.steps.bodySha256 !== hash)
      throw new AppError('VALIDATION', { fields: ['idempotency-key'] });
    return { status: 202 as const, body: jobResponse(row) };
  }

  defineRoute(context, {
    method: 'post',
    path: '/songs',
    auth: 'required',
    rateLimit: { key: 'songs', by: 'user' },
    description:
      'Starts a song generation job (FR-08): moderation, routing, credit reservation, then the job runs in the worker. Requires Idempotency-Key; a replay returns the same job.',
    request: {
      params: z.object({}),
      query: z.object({}),
      headers: idempotencyHeadersSchema,
      body: songCreateRequestSchema,
    },
    response: { 202: jobResponseSchema },
    responseHeaders: { 'Cache-Control': 'private, no-store' },
    handler: async ({ body, headers }) => {
      const { userId } = caller();
      const key = headers['idempotency-key'];
      await requireAiDisclosure(service, userId);
      await requireModerationAccount(service, userId);
      const hash = bodyHash(body);
      const previous = await jobByKey(userId, key);
      if (previous) return replay(previous, hash);
      if (await deps.flags.killSwitch({ operation: 'generate' }))
        throw new AppError('KILL_SWITCH');
      const lyrics = body.instrumental
        ? ''
        : serialiseLyrics(body.sections ?? []);
      const decision = await deps.moderate({
        userId,
        language: body.language,
        parts: [
          { surface: 'title', text: body.title },
          { surface: 'description', text: body.description },
          ...(lyrics ? [{ surface: 'lyrics' as const, text: lyrics }] : []),
          ...(body.style
            ? [{ surface: 'style' as const, text: body.style }]
            : []),
        ],
      });
      if (decision.action === 'hard_block')
        throw new AppError('MODERATION_HARD_BLOCKED');
      if (decision.action === 'block')
        throw new AppError('MODERATION_BLOCKED', {
          category: decision.category,
        });
      const registry = await deps.models();
      const models = await registry.catalogue('generate');
      const routed = route({
        operation: 'generate',
        language: body.instrumental ? null : body.language,
        instrumental: body.instrumental,
        models,
        allowBetaLanguages: false,
        ...(body.modelId ? { requestedModelId: body.modelId } : {}),
      });
      if (!routed.ok)
        throw new AppError('MODEL_NOT_ELIGIBLE', { perModel: routed.perModel });
      const model = models.find((m) => m.id === routed.modelId);
      const adapter = (await registry.usableModels()).find(
        (m) => m.id === routed.modelId,
      )?.adapter;
      const price = model?.prices.generate;
      if (!model || !adapter || price === undefined)
        throw new AppError('INTERNAL');
      const started = await startJob(service, {
        p_user_id: userId,
        p_operation: 'generate',
        p_model_id: model.id,
        p_amount: price,
        p_idem_key: key,
        p_concurrency_limit: await deps.flags.getFlag('per_user_concurrency'),
      });
      const correlation = requestContext.getStore()?.correlationId;
      const correlationId =
        correlation && uuid.safeParse(correlation).success
          ? correlation
          : randomUUID();
      const claimed = creditRpcResult(
        await service()
          .schema('app')
          .rpc('claim_song_job', {
            p_job_id: started.id,
            p_body_sha256: hash,
            p_correlation_id: correlationId,
            p_route: { ...routed.reason },
            p_request: {
              title: body.title,
              description: body.description,
              lyrics,
              language: body.language,
              instrumental: body.instrumental,
              durationSec: body.durationSec,
            },
            p_song: {
              title: body.title,
              lyrics,
              sections: body.instrumental ? [] : (body.sections ?? []),
              language: body.language,
              style: body.style ? { text: body.style } : {},
              instrumental: body.instrumental,
              explicit: decision.explicit,
              moderation_decision_id: decision.decisionId,
            },
          }),
        songJobRowSchema,
      );
      // A concurrent request with the same key claimed first.
      if (claimed.steps.bodySha256 !== hash) return replay(claimed, hash);
      try {
        await deps.enqueue(`music:${adapter}`, 'generate', {
          jobId: claimed.id,
          correlationId,
        });
      } catch {
        // The job stays queued; the sweeper enqueues it (TRD §9.4).
        deps.logger.warn({ jobId: claimed.id }, 'song.enqueue_deferred');
      }
      return { status: 202, body: jobResponse(claimed) };
    },
  });

  defineRoute(context, {
    method: 'get',
    path: '/jobs/:id',
    auth: 'required',
    description:
      'Job status for polling when Realtime is unavailable (A-08); own jobs only.',
    request: { params: z.object({ id: z.uuid() }), query: z.object({}) },
    response: { 200: jobResponseSchema },
    responseHeaders: { 'Cache-Control': 'private, no-store' },
    handler: async ({ params }) => {
      const { userId } = caller();
      const result = await service()
        .from('generation_jobs')
        .select(JOB_COLUMNS)
        .eq('id', params.id)
        .eq('user_id', userId)
        .maybeSingle();
      if (result.error) throw new AppError('INTERNAL');
      if (!result.data) throw new AppError('NOT_FOUND');
      return {
        status: 200,
        body: jobResponse(songJobRowSchema.parse(result.data)),
      };
    },
  });
}
