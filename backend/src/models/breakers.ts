import { z } from 'zod';
import {
  providerErrorCodeSchema,
  providerHealthSchema,
  type ProviderErrorCode,
} from '@songsmith/schemas';
import type { Service } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
const providerSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export function createBreakers(service: Service) {
  return {
    async states() {
      const result = await service()
        .schema('app')
        .from('provider_health')
        .select('provider,breaker_state');
      if (result.error) throw new AppError('INTERNAL');
      return z.array(providerHealthSchema).parse(result.data);
    },
    async recordProviderResult(
      provider: string,
      ok: boolean,
      kind: ProviderErrorCode = 'unknown',
    ) {
      const result = await service()
        .schema('app')
        .rpc('record_provider_result', {
          provider: providerSchema.parse(provider),
          ok: z.boolean().parse(ok),
          kind: providerErrorCodeSchema.parse(kind),
        });
      if (result.error) throw new AppError('INTERNAL');
    },
    async claimProviderProbe(provider: string) {
      const result = await service()
        .schema('app')
        .rpc('claim_provider_probe', {
          provider: providerSchema.parse(provider),
        });
      if (result.error) throw new AppError('INTERNAL');
      return z.boolean().parse(result.data);
    },
  };
}
