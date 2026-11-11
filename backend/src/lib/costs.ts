import { z } from 'zod';
import {
  capStatusSchema,
  costScopeSchema,
  microUsdSchema,
  isFlagKey,
} from '@songsmith/schemas';
import type { Service } from './auth.js';
import type { FlagService } from './flags.js';
import { AppError } from './errors.js';

export function createCosts(service: Service, flags: FlagService) {
  return {
    async addCost(scope: string, microUsd: number) {
      const result = await service()
        .schema('app')
        .rpc('add_cost', {
          scope: costScopeSchema.parse(scope),
          micro_usd: microUsdSchema.parse(microUsd),
        });
      if (result.error) throw new AppError('INTERNAL');
    },
    async capStatus(userId: string, provider: string, estMicroUsd: number) {
      const key = `cap:provider_daily_micro_usd:${provider}`;
      if (!isFlagKey(key)) throw new AppError('VALIDATION');
      const values = await flags.getFlags();
      const result = await service()
        .schema('app')
        .rpc('cap_status', {
          user_id: z.uuid().parse(userId),
          provider,
          est_micro_usd: microUsdSchema.parse(estMicroUsd),
          user_cap: values['cap:user_daily_micro_usd'],
          provider_cap: microUsdSchema.parse(values[key]),
          global_cap: values['cap:global_daily_micro_usd'],
        });
      if (result.error) throw new AppError('INTERNAL');
      const row = capStatusSchema.parse(result.data)[0];
      if (!row) throw new AppError('INTERNAL');
      return row;
    },
  };
}
