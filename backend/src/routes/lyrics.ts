import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  idempotencyHeadersSchema,
  lyricsRewriteRequestSchema,
  lyricsRewriteResponseSchema,
  lyricsWriteRequestSchema,
  lyricsWriteResponseSchema,
  lyricistJobSchema,
  type Decision,
  type ErrorCode,
} from '@songsmith/schemas';
import { serialiseLyrics } from '@songsmith/domain';
import { caller, requireConsent, type Service } from '../lib/auth.js';
import { requestContext } from '../lib/correlation.js';
import { AppError } from '../lib/errors.js';
import type { FlagService } from '../lib/flags.js';
import type { Logger } from '../lib/log.js';
import { defineRoute, type RouteContext } from '../lib/route.js';
import {
  claimLyricistJob,
  completeLyricistJob,
  failLyricistJob,
  startJob,
} from '../credits/ledger.js';
import { rewriteSection, writeLyrics } from '../lyricist/index.js';
import type { createRegistry } from '../models/registry.js';
import {
  requireModerationAccount,
  type createModeration,
} from '../moderation/pipeline.js';
import { ProviderError } from '../providers/errors.js';
import type { TextAdapter } from '../providers/types.js';

type Models = () => Promise<
  Pick<Awaited<ReturnType<typeof createRegistry>>, 'lyricist' | 'adapter'>
>;
type Moderate = ReturnType<typeof createModeration>;
type Operation = 'lyrics' | 'rewrite';
type Job = z.infer<typeof lyricistJobSchema>;
const TIMEOUT_MS = 30_000;
const requireAiDisclosure = requireConsent('ai_disclosure');

export function bodyHash(body: unknown) {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}
function blocked(decision: Decision) {
  if (decision.action === 'hard_block')
    return new AppError('MODERATION_HARD_BLOCKED');
  if (decision.action === 'block')
    return new AppError('MODERATION_BLOCKED', { category: decision.category });
  return undefined;
}
function errorCode(error: unknown): ErrorCode {
  if (error instanceof AppError) return error.code;
  if (error instanceof ProviderError && error.code === 'timeout')
    return 'PROVIDER_TIMEOUT';
  return 'INTERNAL';
}

export function registerLyrics(
  context: RouteContext,
  deps: {
    service: Service;
    flags: Pick<FlagService, 'getFlag'>;
    logger: Pick<Logger, 'info' | 'warn'>;
    models: Models;
    moderate: Moderate;
  },
) {
  const { service } = deps;

  async function existingJob(userId: string, key: string) {
    const result = await service()
      .from('generation_jobs')
      .select(
        'id,user_id,operation,model_id,reservation_id,idempotency_key,status,steps,error_code',
      )
      .eq('user_id', userId)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (result.error) throw new AppError('INTERNAL');
    return result.data ? lyricistJobSchema.parse(result.data) : undefined;
  }

  // TRD §9: a replay returns the first result and charges nothing.
  function replay<T>(
    job: Job,
    operation: Operation,
    hash: string,
    result: z.ZodType<T>,
  ): T {
    const stored = job.steps.lyricist;
    if (job.operation !== operation || (stored && stored.bodySha256 !== hash))
      throw new AppError('VALIDATION', { fields: ['idempotency-key'] });
    if (job.status === 'ready') {
      const parsed = result.safeParse(stored?.result);
      if (!parsed.success) throw new AppError('INTERNAL');
      return parsed.data;
    }
    if (job.status === 'running') throw new AppError('CONFLICT');
    throw new AppError(
      (job.error_code && job.error_code in errorCodes
        ? job.error_code
        : 'INTERNAL') as ErrorCode,
    );
  }

  async function run<T extends { explicit: boolean }>(input: {
    operation: Operation;
    key: string;
    body: unknown;
    parts: Array<{
      surface:
        'description' | 'style' | 'gift' | 'lyrics' | 'rewrite_instruction';
      text: string;
    }>;
    language: string;
    result: z.ZodType<Omit<T, 'jobId'>>;
    call: (
      adapter: TextAdapter,
      ctx: { userId: string; jobId: string },
    ) => Promise<{ output: Omit<T, 'jobId' | 'explicit'>; text: string }>;
  }): Promise<Omit<T, 'jobId'> & { jobId: string }> {
    const { userId } = caller();
    await requireAiDisclosure(service, userId);
    await requireModerationAccount(service, userId);
    const hash = bodyHash(input.body);
    const previous = await existingJob(userId, input.key);
    if (previous)
      return {
        ...replay(previous, input.operation, hash, input.result),
        jobId: previous.id,
      };
    const registry = await deps.models();
    const model = await registry.lyricist();
    if (!model) throw new AppError('INTERNAL');
    if (!model.available) throw new AppError('KILL_SWITCH');
    const adapter = registry.adapter(model.adapterId);
    if (!adapter || !('completeJson' in adapter))
      throw new AppError('INTERNAL');
    const inputDecision = await deps.moderate({
      parts: input.parts,
      userId,
      language: input.language,
    });
    const refused = blocked(inputDecision);
    if (refused) throw refused;
    const started = await startJob(service, {
      p_user_id: userId,
      p_operation: input.operation,
      p_model_id: model.modelId,
      p_amount: model.prices[input.operation],
      p_idem_key: input.key,
      p_concurrency_limit: await deps.flags.getFlag('per_user_concurrency'),
    });
    const job = await claimLyricistJob(service, {
      p_job_id: started.id,
      p_body_sha256: hash,
    });
    // A concurrent request with the same key won the insert.
    if (job.status !== 'running' || job.steps.lyricist?.bodySha256 !== hash)
      return {
        ...replay(job, input.operation, hash, input.result),
        jobId: job.id,
      };
    const start = Date.now();
    try {
      const { output, text } = await input.call(adapter, {
        userId,
        jobId: job.id,
      });
      const outputDecision = await deps.moderate({
        parts: [{ surface: 'output_lyrics', text }],
        userId,
        language: input.language,
      });
      const outputRefused = blocked(outputDecision);
      if (outputRefused) throw outputRefused;
      const stored = input.result.parse({
        ...output,
        explicit: inputDecision.explicit || outputDecision.explicit,
      });
      await completeLyricistJob(service, {
        p_job_id: job.id,
        p_result: stored as Parameters<
          typeof completeLyricistJob
        >[1]['p_result'],
      });
      deps.logger.info(
        {
          jobId: job.id,
          operation: input.operation,
          latencyMs: Date.now() - start,
        },
        'lyricist.completed',
      );
      return { ...stored, jobId: job.id };
    } catch (error) {
      const code = errorCode(error);
      await failLyricistJob(service, { p_job_id: job.id, p_error_code: code });
      deps.logger.warn(
        { jobId: job.id, operation: input.operation, errorCode: code },
        'lyricist.failed',
      );
      throw error instanceof AppError ? error : new AppError(code);
    }
  }

  const ctx = (userId: string, jobId: string) => ({
    userId,
    jobId,
    correlationId: requestContext.getStore()?.correlationId ?? randomUUID(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  defineRoute(context, {
    method: 'post',
    path: '/lyrics/write',
    auth: 'required',
    rateLimit: { key: 'lyrics', by: 'user' },
    description:
      'Writes lyrics with section tags, a title and a suggested style (FR-02). Costs the lyricist price from the catalogue; requires Idempotency-Key.',
    request: {
      params: z.object({}),
      query: z.object({}),
      headers: idempotencyHeadersSchema,
      body: lyricsWriteRequestSchema,
    },
    response: { 200: lyricsWriteResponseSchema },
    responseHeaders: { 'Cache-Control': 'private, no-store' },
    handler: async ({ body, headers }) => {
      const giftNames = body.giftNames ?? [];
      const result = await run({
        operation: 'lyrics',
        key: headers['idempotency-key'],
        body,
        language: body.language,
        result: lyricsWriteResponseSchema.omit({ jobId: true }),
        parts: [
          { surface: 'description', text: body.description },
          ...(body.style
            ? [{ surface: 'style' as const, text: body.style }]
            : []),
          ...(giftNames.length
            ? [{ surface: 'gift' as const, text: giftNames.join('\n') }]
            : []),
        ],
        call: async (adapter, ids) => {
          const { lyrics } = await writeLyrics(
            { adapter, ctx: ctx(ids.userId, ids.jobId) },
            {
              task: 'write',
              language: body.language,
              description: body.description,
              ...(body.style ? { style: body.style } : {}),
              occasion: body.occasion ?? 'general',
              giftNames,
            },
          );
          return {
            output: { lyrics },
            text: `${lyrics.title}\n${serialiseLyrics(lyrics.sections)}`,
          };
        },
      });
      return { status: 200, body: lyricsWriteResponseSchema.parse(result) };
    },
  });

  defineRoute(context, {
    method: 'post',
    path: '/lyrics/rewrite-section',
    auth: 'required',
    rateLimit: { key: 'lyrics', by: 'user' },
    description:
      'Rewrites one section with an optional instruction (FR-03). Costs the lyricist rewrite price; requires Idempotency-Key.',
    request: {
      params: z.object({}),
      query: z.object({}),
      headers: idempotencyHeadersSchema,
      body: lyricsRewriteRequestSchema,
    },
    response: { 200: lyricsRewriteResponseSchema },
    responseHeaders: { 'Cache-Control': 'private, no-store' },
    handler: async ({ body, headers }) => {
      const result = await run({
        operation: 'rewrite',
        key: headers['idempotency-key'],
        body,
        language: body.language,
        result: lyricsRewriteResponseSchema.omit({ jobId: true }),
        parts: [
          { surface: 'lyrics', text: serialiseLyrics(body.sections) },
          ...(body.instruction
            ? [
                {
                  surface: 'rewrite_instruction' as const,
                  text: body.instruction,
                },
              ]
            : []),
        ],
        call: async (adapter, ids) => {
          const { section } = await rewriteSection(
            { adapter, ctx: ctx(ids.userId, ids.jobId) },
            {
              task: 'rewrite',
              language: body.language,
              sections: body.sections,
              index: body.index,
              ...(body.instruction ? { instruction: body.instruction } : {}),
            },
          );
          return { output: { section }, text: serialiseLyrics([section]) };
        },
      });
      return { status: 200, body: lyricsRewriteResponseSchema.parse(result) };
    },
  });
}
const errorCodes: Record<string, true> = Object.fromEntries(
  (
    [
      'PROVIDER_TIMEOUT',
      'LYRICS_INVALID',
      'MODERATION_BLOCKED',
      'MODERATION_HARD_BLOCKED',
      'KILL_SWITCH',
      'INTERNAL',
    ] satisfies ErrorCode[]
  ).map((c) => [c, true]),
);
