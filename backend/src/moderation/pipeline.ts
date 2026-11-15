import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  checkDeterministic,
  type DeterministicResult,
} from '@songsmith/moderation-rules';
import {
  classifierOutputSchema,
  tierOf,
  moderationInputSchema,
  cachedModerationSchema,
  recordedModerationSchema,
  restrictionSchema,
  type ModerationInput,
  type Decision,
} from '@songsmith/schemas';
import type { Service } from '../lib/auth.js';
import type { FlagService } from '../lib/flags.js';
import type { Logger } from '../lib/log.js';
import { AppError } from '../lib/errors.js';
import { requestContext } from '../lib/correlation.js';
import type { createRegistry } from '../models/registry.js';
import { ProviderError } from '../providers/errors.js';
import { buildPolicyPrompt, POLICY_VERSION } from './prompt.js';
export { POLICY_VERSION } from './prompt.js';
export const CACHE_MS = 600_000;
export function inputHash(parts: ModerationInput['parts']) {
  return createHash('sha256')
    .update(
      JSON.stringify(parts.map(({ surface, text }) => ({ surface, text }))) +
        POLICY_VERSION,
    )
    .digest('hex');
}
export function combineParts(parts: ModerationInput['parts']) {
  return parts
    .map((p) => `[${p.surface}]\n${p.text}\n[/${p.surface}]`)
    .join('\n');
}
export function combineDecision(
  layer1: DeterministicResult,
  classifier?: z.infer<typeof classifierOutputSchema>,
) {
  if (layer1.action !== 'pass') {
    const category =
      layer1.action === 'hard_block' ? 'minor_sexual' : 'artist_impersonation';
    return {
      action: layer1.action,
      category,
      severity: layer1.action === 'hard_block' ? 'critical' : 'high',
      lowConfidence: false,
    } as const;
  }
  if (!classifier)
    return {
      action: 'block',
      category: 'classifier_error',
      severity: 'high',
      lowConfidence: false,
    } as const;
  const action = tierOf(classifier.category);
  return {
    action,
    category: classifier.category,
    severity: classifier.severity,
    lowConfidence: action === 'hard_block' && classifier.confidence < 0.8,
  };
}
// Reusable by generation endpoints when they arrive. Expiry is evaluated in SQL.
export async function requireModerationAccount(
  service: Service,
  userId: string,
) {
  const result = await service()
    .schema('app')
    .rpc('moderation_account_status', { p_user_id: userId });
  if (result.error) throw new AppError('INTERNAL');
  const row = z.array(restrictionSchema).length(1).parse(result.data)[0];
  if (!row) throw new AppError('INTERNAL');
  if (row.status === 'deleted') throw new AppError('UNAUTHENTICATED');
  if (row.status === 'banned') throw new AppError('FORBIDDEN');
  if (row.status === 'cooldown' || row.status === 'suspended')
    throw new AppError(
      'ACCOUNT_RESTRICTED',
      row.status === 'cooldown' ? { until: row.cooldown_until } : undefined,
    );
}
export function createModeration(deps: {
  service: Service;
  flags: Pick<FlagService, 'getFlags'>;
  logger: Pick<Logger, 'info'>;
  models: () => Promise<
    Pick<Awaited<ReturnType<typeof createRegistry>>, 'usableModels' | 'adapter'>
  >;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  return async function moderate(input: ModerationInput): Promise<Decision> {
    const { parts, userId } = moderationInputSchema.parse(input);
    const surface = parts[0]?.surface;
    if (!surface) throw new AppError('VALIDATION');
    const start = now();
    const hash = inputHash(parts);
    const cached = await deps
      .service()
      .schema('app')
      .from('moderation_decisions')
      .select('id,action,category')
      .eq('user_id', userId)
      .eq('input_sha256', hash)
      .eq('policy_version', POLICY_VERSION)
      .gt('created_at', new Date(now() - CACHE_MS).toISOString())
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);
    if (cached.error) throw new AppError('INTERNAL');
    const hit = z.array(cachedModerationSchema).parse(cached.data)[0];
    if (hit)
      return {
        decisionId: hit.id,
        action: hit.action,
        category: hit.category,
        explicit: hit.action === 'allow_explicit',
        cached: true,
      };
    const text = combineParts(parts);
    const layer1 = checkDeterministic(text);
    let classifier: z.infer<typeof classifierOutputSchema> | undefined;
    let modelId: string | null = null;
    if (layer1.action === 'pass') {
      const registry = await deps.models();
      const model = (await registry.usableModels())
        .filter((m) => m.kind === 'text')
        .sort(
          (a, b) => b.quality_rank - a.quality_rank || a.id.localeCompare(b.id),
        )[0];
      const adapter = model ? registry.adapter(model.adapter) : undefined;
      if (model && adapter && 'completeJson' in adapter) {
        modelId = model.id;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const prompt = buildPolicyPrompt(text);
            const result = await adapter.completeJson(
              {
                system: prompt.system,
                user: prompt.user,
                schema: classifierOutputSchema,
                maxTokens: 1024,
              },
              {
                userId,
                jobId: randomUUID(),
                correlationId:
                  requestContext.getStore()?.correlationId ?? randomUUID(),
                signal: AbortSignal.timeout(30_000),
              },
            );
            classifier = classifierOutputSchema.parse(result.value);
            break;
          } catch (error) {
            if (!(
              error instanceof ProviderError ||
              error instanceof z.ZodError ||
              error instanceof SyntaxError
            ))
              throw new AppError('INTERNAL');
          }
        }
      }
    }
    const combined = combineDecision(layer1, classifier);
    const latencyMs = Math.max(0, Math.round(now() - start));
    const flags = await deps.flags.getFlags();
    const storeEvidence =
      combined.action === 'hard_block' ||
      (combined.action === 'block' && combined.category !== 'classifier_error');
    const result = await deps
      .service()
      .schema('app')
      .rpc('record_moderation_decision', {
        p_user_id: userId,
        p_surface: surface,
        p_input_sha256: hash,
        p_policy_version: POLICY_VERSION,
        p_layers: {
          surfaces: parts.map((p) => p.surface),
          layer1: {
            action: layer1.action,
            hits: layer1.hits.map((hit) => ({
              rule: hit.rule,
              category: hit.category,
            })),
          },
          lowConfidence: combined.lowConfidence,
          classifier: classifier
            ? {
                category: classifier.category,
                severity: classifier.severity,
                confidence: classifier.confidence,
                modelId,
              }
            : null,
        },
        p_category: combined.category,
        p_action: combined.action,
        p_severity: combined.severity,
        p_latency_ms: latencyMs,
        p_window_seconds: flags.block_window_seconds,
        p_cooldown_threshold: flags.block_cooldown_threshold,
        p_cooldown_seconds: flags.block_cooldown_seconds,
        p_suspend_threshold: flags.block_suspend_threshold,
        ...(modelId ? { p_classifier_model: modelId } : {}),
        // Evidence only for categories that need review (FR-54).
        ...(storeEvidence ? { p_text: text } : {}),
      });
    if (result.error) throw new AppError('INTERNAL');
    const row = z
      .array(recordedModerationSchema)
      .length(1)
      .parse(result.data)[0];
    if (!row) throw new AppError('INTERNAL');
    deps.logger.info(
      {
        decisionId: row.decision_id,
        userId,
        action: combined.action,
        category: combined.category,
        latencyMs,
      },
      'moderation.decision',
    );
    if (combined.action === 'hard_block')
      deps.logger.info(
        { caseId: row.case_id, userId },
        'moderation.hard_block',
      );
    return {
      decisionId: row.decision_id,
      action: combined.action,
      category: combined.category,
      explicit: combined.action === 'allow_explicit',
      cached: false,
    };
  };
}
