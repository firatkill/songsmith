import {
  classifierOutputSchema,
  tierOf,
  lyricistDataSchema,
  LYRICIST_REPAIR_PREFIX,
  type LyricistData,
} from '@songsmith/schemas';
import { formatMessage, type MessageKey } from '@songsmith/i18n';
import { providerCall, ProviderError } from '../errors.js';
import type { TextAdapter } from '../types.js';
import { simulate, type MockRuntime } from './latency.js';
import { categoryTrigger } from './triggers.js';
export const TEXT_COST_MICRO_USD = 1000;
// The requested output schema selects the mock role, so real prompts work unchanged.
// Callers run moderate() first (T-15/T-18); this adapter is never a moderation entry point.
const classifierProbe = {
  category: 'none',
  severity: 'none',
  evidence: [],
  confidence: 0.1,
};
export function createText(runtime: MockRuntime): TextAdapter {
  return {
    id: 'mock-text',
    completeJson: (req, ctx) =>
      providerCall(async () => {
        if (!Number.isSafeInteger(req.maxTokens) || req.maxTokens <= 0)
          throw new ProviderError('invalid_request', false);
        const classifier = req.schema.safeParse(classifierProbe).success;
        // Provider failure triggers target the generation step (lyricist,
        // music), so the classifier ignores them and moderation still passes.
        await simulate(
          runtime,
          classifier
            ? req.user.replace(
                /⟦mock:fail:(?:timeout|rate_limited|provider_policy)⟧/gu,
                '',
              )
            : req.user,
          ctx.signal,
        );
        if (
          runtime.mode === 'mock' &&
          req.user.includes('⟦mock:fail:invalid_json⟧')
        ) {
          JSON.parse('{');
        }
        let value: unknown;
        if (classifier) {
          const marker = categoryTrigger(req.user, runtime.mode);
          const category = marker ?? 'none';
          value = classifierOutputSchema.parse({
            category,
            severity:
              tierOf(category) === 'hard_block'
                ? 'critical'
                : tierOf(category) === 'block'
                  ? 'high'
                  : category === 'explicit'
                    ? 'low'
                    : 'none',
            evidence: [],
            confidence: marker ? 1 : 0.1,
          });
        } else {
          value = mockLyricist(req.user, runtime.mode);
        }
        const parsed = req.schema.safeParse(value);
        if (!parsed.success) throw new ProviderError('invalid_request', false);
        return { value: parsed.data, costMicroUsd: TEXT_COST_MICRO_USD };
      }),
  };
}

// Lyricist role (TRD §8.4): a deterministic template in the requested language
// that uses the description's keywords and every gift name. Mock-only triggers
// in the data: ⟦mock:lyrics:invalid⟧ always answers with an unknown tag;
// ⟦mock:lyrics:invalid_once⟧ does so until the repair attempt.
const BLOCK = /^BEGIN (songsmith_data_[a-f0-9]+)\n([\s\S]*?)\nEND \1$/mu;
function mockLyricist(user: string, mode: 'mock' | 'live') {
  const raw = BLOCK.exec(user)?.[2];
  let data: LyricistData;
  try {
    data = lyricistDataSchema.parse(JSON.parse(raw ?? user));
  } catch {
    throw new ProviderError('invalid_request', false);
  }
  const repairing = user.includes(LYRICIST_REPAIR_PREFIX);
  const invalid =
    mode === 'mock' &&
    (user.includes('⟦mock:lyrics:invalid⟧') ||
      (user.includes('⟦mock:lyrics:invalid_once⟧') && !repairing));
  const { language } = data;
  const t = (key: MessageKey, values?: Record<string, string>) =>
    formatMessage(language, key, values);
  if (data.task === 'rewrite') {
    const current = data.sections[data.index];
    return {
      tag: invalid ? '[Hook]' : (current?.tag ?? '[Verse]'),
      lines: [t('mockLyrics.rewrite'), t('mockLyrics.rewrite2')],
    };
  }
  const keywords = data.description
    .split(/\s+/u)
    .filter((w) => w && !w.startsWith('⟦'))
    .slice(0, 6)
    .join(' ');
  const names = data.giftNames.join(', ');
  const title = t(`mockLyrics.${data.occasion}`);
  const lead = (line: string) => line.replace(/^[\s,]+/u, '');
  return {
    title,
    language,
    suggestedStyle: t('mockLyrics.style'),
    sections: [
      {
        tag: invalid ? '[Hook]' : '[Verse]',
        lines: [
          lead(t('mockLyrics.verse', { keywords, names })),
          t('mockLyrics.verse2'),
          t('mockLyrics.verse3'),
        ],
      },
      {
        tag: '[Chorus]',
        lines: [
          lead(t('mockLyrics.chorus', { title, names })).replace(
            /[\s,]+$/u,
            '',
          ),
          t('mockLyrics.chorus2'),
        ],
      },
    ],
  };
}
