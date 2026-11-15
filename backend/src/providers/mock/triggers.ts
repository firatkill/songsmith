import { moderationCategorySchema } from '@songsmith/schemas';
import { ProviderError } from '../errors.js';
export function failureTrigger(text: string, mode: 'mock' | 'live') {
  if (mode !== 'mock') return;
  if (text.includes('⟦mock:fail:timeout⟧'))
    throw new ProviderError('timeout', true);
  if (text.includes('⟦mock:fail:rate_limited⟧'))
    throw new ProviderError('rate_limited', true, 5000);
  if (text.includes('⟦mock:fail:provider_policy⟧'))
    throw new ProviderError('rejected_by_provider_policy', false);
}
export function slowTrigger(text: string, mode: 'mock' | 'live') {
  return mode === 'mock' && text.includes('⟦mock:slow⟧');
}
export function categoryTrigger(text: string, mode: 'mock' | 'live') {
  if (mode !== 'mock') return undefined;
  for (const match of text.matchAll(/⟦mock:([^⟧]+)⟧/gu)) {
    const parsed = moderationCategorySchema.safeParse(match[1]);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}
