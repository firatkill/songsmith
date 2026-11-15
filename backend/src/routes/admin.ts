import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  adminCatalogueSchema,
  adminFlagPutSchema,
  adminFlagsSchema,
  adminModelPatchSchema,
  adminModelSchema,
  adminWhoamiSchema,
  flagRegistry,
  isFlagKey,
  staffRoleSchema,
  type Json,
} from '@songsmith/schemas';
import { caller, type Service } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';
import { AppError } from '../lib/errors.js';
import type { FlagService } from '../lib/flags.js';
import { defineRoute, type RouteContext } from '../lib/route.js';

export interface AdminRegistry {
  usableModels: () => Promise<{ id: string }[]>;
  invalidate: () => void;
}

const modelId = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/) });
const flagKey = z.object({ key: z.string().min(1).max(128) });

// The staff + AAL2 guard is mounted on /v1/admin in app.ts; these routes add
// their own audit rows for every change.
export function registerAdmin(
  context: RouteContext,
  service: Service,
  flags: FlagService,
  registry: () => Promise<AdminRegistry>,
) {
  defineRoute(context, {
    method: 'get',
    path: '/admin/whoami',
    auth: 'required',
    request: { params: z.object({}), query: z.object({}) },
    response: { 200: adminWhoamiSchema },
    description: 'Staff identity for the admin console (staff and AAL2 only).',
    handler: async () => {
      const { userId } = caller();
      const result = await service()
        .schema('app')
        .from('staff_roles')
        .select('role')
        .eq('user_id', userId);
      if (result.error) throw new AppError('INTERNAL');
      return {
        status: 200,
        body: {
          userId,
          roles: result.data.map((row) => staffRoleSchema.parse(row.role)),
        },
      };
    },
  });

  async function catalogue() {
    const [models, prices, languages] = await Promise.all([
      service()
        .from('models')
        .select('id,kind,adapter,display_name,enabled,quality_rank,is_mock')
        .order('kind')
        .order('quality_rank', { ascending: false })
        .order('id'),
      service()
        .from('model_prices')
        .select('model_id,operation,credits,est_cost_micro_usd')
        .order('operation'),
      service()
        .from('model_languages')
        .select('model_id,language,status')
        .order('language'),
    ]);
    if (models.error || prices.error || languages.error)
      throw new AppError('INTERNAL');
    const usable = new Set(
      (await (await registry()).usableModels()).map((model) => model.id),
    );
    return models.data.map((row) =>
      adminModelSchema.parse({
        id: row.id,
        kind: row.kind,
        adapter: row.adapter,
        displayName: row.display_name,
        enabled: row.enabled,
        qualityRank: row.quality_rank,
        isMock: row.is_mock,
        usable: usable.has(row.id),
        prices: prices.data
          .filter((price) => price.model_id === row.id)
          .map((price) => ({
            operation: price.operation,
            credits: price.credits,
            estCostMicroUsd: price.est_cost_micro_usd,
          })),
        languages: languages.data
          .filter((language) => language.model_id === row.id)
          .map((language) => ({
            language: language.language,
            status: language.status,
          })),
      }),
    );
  }

  defineRoute(context, {
    method: 'get',
    path: '/admin/catalogue',
    auth: 'required',
    request: { params: z.object({}), query: z.object({}) },
    response: { 200: adminCatalogueSchema },
    description:
      'All catalogue rows with prices, languages and current usability.',
    handler: async () => ({
      status: 200,
      body: { models: await catalogue() },
    }),
  });

  defineRoute(context, {
    method: 'patch',
    path: '/admin/catalogue/:id',
    auth: 'required',
    request: {
      params: modelId,
      query: z.object({}),
      body: adminModelPatchSchema,
    },
    response: { 200: adminModelSchema },
    description:
      'Enable or disable a model or change its quality rank. Audited; applies within 60 s.',
    handler: async ({ params, body }) => {
      const { userId } = caller();
      const before = await service()
        .from('models')
        .select('enabled,quality_rank')
        .eq('id', params.id)
        .maybeSingle();
      if (before.error) throw new AppError('INTERNAL');
      if (!before.data) throw new AppError('NOT_FOUND');
      const update = {
        ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
        ...(body.qualityRank === undefined
          ? {}
          : { quality_rank: body.qualityRank }),
      };
      const result = await service()
        .from('models')
        .update(update)
        .eq('id', params.id);
      if (result.error) throw new AppError('INTERNAL');
      await writeAudit(service, {
        actorId: userId,
        action: 'catalogue.update',
        target: `models/${params.id}`,
        diff: {
          before: {
            enabled: before.data.enabled,
            qualityRank: before.data.quality_rank,
          },
          after: {
            enabled: body.enabled ?? before.data.enabled,
            qualityRank: body.qualityRank ?? before.data.quality_rank,
          },
        },
      });
      (await registry()).invalidate();
      const model = (await catalogue()).find((row) => row.id === params.id);
      if (!model) throw new AppError('NOT_FOUND');
      return { status: 200, body: model };
    },
  });

  function flagType(value: unknown): 'boolean' | 'number' | 'json' {
    return typeof value === 'boolean'
      ? 'boolean'
      : typeof value === 'number'
        ? 'number'
        : 'json';
  }

  defineRoute(context, {
    method: 'get',
    path: '/admin/flags',
    auth: 'required',
    request: { params: z.object({}), query: z.object({}) },
    response: { 200: adminFlagsSchema },
    description: 'Every registered flag with its current and default value.',
    handler: async () => {
      flags.invalidate();
      const values = await flags.getFlags();
      return {
        status: 200,
        body: {
          flags: Object.entries(flagRegistry).map(([key, entry]) => {
            const value: unknown = values[key as keyof typeof values];
            return {
              key,
              description: entry.description,
              public: entry.public,
              placeholder: entry.placeholder,
              type: flagType(entry.default),
              value,
              defaultValue: entry.default,
              isDefault: isDeepStrictEqual(value, entry.default),
            };
          }),
        },
      };
    },
  });

  defineRoute(context, {
    method: 'put',
    path: '/admin/flags/:key',
    auth: 'required',
    request: {
      params: flagKey,
      query: z.object({}),
      body: adminFlagPutSchema,
    },
    response: { 200: adminFlagsSchema.shape.flags.element },
    description:
      'Set a flag value. Validated against the flag registry; audited; applies within 60 s.',
    handler: async ({ params, body }) => {
      const { userId } = caller();
      if (!isFlagKey(params.key)) throw new AppError('NOT_FOUND');
      const entry = flagRegistry[params.key];
      const parsed = entry.schema.safeParse(body.value);
      if (!parsed.success) throw new AppError('VALIDATION');
      flags.invalidate();
      const before: unknown = (await flags.getFlags())[params.key];
      const value = parsed.data as Json;
      // app.flags.value is not null; no registered flag accepts null.
      if (value === null) throw new AppError('VALIDATION');
      const result = await service()
        .schema('app')
        .from('flags')
        .upsert(
          { key: params.key, value, updated_by: userId },
          { onConflict: 'key' },
        );
      if (result.error) throw new AppError('INTERNAL');
      await writeAudit(service, {
        actorId: userId,
        action: 'flags.update',
        target: `flags/${params.key}`,
        diff: { before: before as Json, after: value },
      });
      flags.invalidate();
      (await registry()).invalidate();
      return {
        status: 200,
        body: {
          key: params.key,
          description: entry.description,
          public: entry.public,
          placeholder: entry.placeholder,
          type: flagType(entry.default),
          value,
          defaultValue: entry.default,
          isDefault: isDeepStrictEqual(value, entry.default),
        },
      };
    },
  });
}
