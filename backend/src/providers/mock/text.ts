import {
  classifierOutputSchema,
  lyricsSchema,
  mockLyricRequestSchema,
} from '@songsmith/schemas';
import { formatMessage } from '@songsmith/i18n';
import { providerCall, ProviderError } from '../errors.js';
import type { TextAdapter } from '../types.js';
import { simulate, type MockRuntime } from './latency.js';
import { categoryTrigger } from './triggers.js';
export const TEXT_COST_MICRO_USD = 1000;
// The requested output schema selects the mock role, so real prompts work unchanged.
// Callers run moderate() first (T-15/T-18); this adapter is never a moderation entry point.
const classifierProbe = {
  category: 'allow',
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
        await simulate(runtime, req.user, ctx.signal);
        let value: unknown;
        if (req.schema.safeParse(classifierProbe).success) {
          const marker = categoryTrigger(req.user, runtime.mode);
          const category = marker ?? 'allow';
          value = classifierOutputSchema.parse({
            category,
            severity:
              category === 'hard_block'
                ? 'critical'
                : category === 'block'
                  ? 'high'
                  : category === 'allow_explicit'
                    ? 'low'
                    : 'none',
            evidence: [],
            confidence: marker ? 1 : 0.1,
          });
        } else {
          let input: unknown;
          try {
            input = JSON.parse(req.user);
          } catch {
            throw new ProviderError('invalid_request', false);
          }
          const parsed = mockLyricRequestSchema.safeParse(input);
          if (!parsed.success)
            throw new ProviderError('invalid_request', false);
          const { language, description, occasion, giftNames } = parsed.data;
          const keywords = description
            .split(/\s+/u)
            .filter(Boolean)
            .slice(0, 6)
            .join(' ');
          const names = giftNames.join(', ');
          const title = formatMessage(language, `mockLyrics.${occasion}`);
          value = lyricsSchema.parse({
            title,
            language,
            suggestedStyle: formatMessage(language, 'mockLyrics.style'),
            sections: [
              {
                tag: '[Verse]',
                lines: [
                  formatMessage(language, 'mockLyrics.verse', {
                    keywords,
                    names,
                  }),
                ],
              },
              {
                tag: '[Chorus]',
                lines: [
                  formatMessage(language, 'mockLyrics.chorus', {
                    title,
                    names,
                  }),
                ],
              },
            ],
          });
        }
        const parsed = req.schema.safeParse(value);
        if (!parsed.success) throw new ProviderError('invalid_request', false);
        return { value: parsed.data, costMicroUsd: TEXT_COST_MICRO_USD };
      }),
  };
}
