import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ageRequestSchema,
  consentRequestSchema,
  consentsResponseSchema,
  meResponseSchema,
  patchMeSchema,
  profileSchema,
  settingsSchema,
  type ConsentKind,
} from '@songsmith/schemas';
import { caller, isAdult, latestConsents, type Service } from '../lib/auth.js';
import { defineRoute, type RouteContext } from '../lib/route.js';
import { AppError } from '../lib/errors.js';

export function registerMe(context: RouteContext, service: Service) {
  const request = { params: z.object({}), query: z.object({}) };
  defineRoute(context, {
    method: 'get',
    path: '/me',
    auth: 'required',
    request,
    response: { 200: meResponseSchema },
    handler: async () => {
      const { userId, profile } = caller();
      const [{ data, error }, consents] = await Promise.all([
        service()
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .single(),
        latestConsents(service, userId),
      ]);
      if (error) throw new AppError('INTERNAL');
      const required: ConsentKind[] = ['terms', 'privacy', 'ai_disclosure'];
      return {
        status: 200,
        body: {
          profile,
          settings: settingsSchema.parse(data),
          consents,
          needsAgeGate: !profile.is_adult,
          missingConsents: required.filter(
            (kind) =>
              !consents.some(
                (c) => c.kind === kind && c.granted && c.isCurrent,
              ),
          ),
        },
      };
    },
  });
  defineRoute(context, {
    method: 'patch',
    path: '/me',
    rateLimit: { key: 'me_patch', by: 'user' },
    auth: 'required',
    request: { ...request, body: patchMeSchema },
    response: { 200: profileSchema },
    description:
      'Updates handle, locale, remix_default and explicit_hidden only. display_name and bio edits wait for the profile moderation pipeline (T-15).',
    handler: async ({ body }) => {
      const { data, error } = await service()
        .from('profiles')
        .update({
          ...(body.handle === undefined ? {} : { handle: body.handle }),
          ...(body.locale === undefined ? {} : { locale: body.locale }),
          ...(body.remix_default === undefined
            ? {}
            : { remix_default: body.remix_default }),
          ...(body.explicit_hidden === undefined
            ? {}
            : { explicit_hidden: body.explicit_hidden }),
        })
        .eq('id', caller().userId)
        .select('*')
        .single();
      if (error)
        throw new AppError(error.code === '23505' ? 'CONFLICT' : 'INTERNAL');
      return { status: 200, body: profileSchema.parse(data) };
    },
  });
  defineRoute(context, {
    method: 'post',
    path: '/me/age',
    rateLimit: { key: 'me_age', by: 'user' },
    auth: 'required',
    request: { ...request, body: ageRequestSchema },
    response: { 200: profileSchema },
    description:
      'Compares the 18th birthday against today in UTC; never stores the date of birth. February 29 birthdays reach adulthood on March 1 in non-leap years.',
    handler: async ({ body }) => {
      const { userId, profile } = caller();
      if (profile.is_adult) throw new AppError('CONFLICT');
      if (body.dateOfBirth > new Date().toISOString().slice(0, 10))
        throw new AppError('VALIDATION');
      if (!isAdult(body.dateOfBirth)) {
        const { data, error } = await service().auth.admin.getUserById(userId);
        if (error || !data.user.email) throw new AppError('INTERNAL');
        const emailHash = createHash('sha256')
          .update(data.user.email.trim().toLowerCase())
          .digest('hex');
        const blocked = await service()
          .schema('app')
          .from('signup_blocks')
          .upsert({
            email_hash: emailHash,
            blocked_until: new Date(Date.now() + 30 * 86400_000).toISOString(),
          });
        if (blocked.error) throw new AppError('INTERNAL');
        const deleted = await service().auth.admin.deleteUser(userId);
        if (deleted.error) throw new AppError('INTERNAL');
        throw new AppError('NOT_ADULT');
      }
      const { data, error } = await service()
        .from('profiles')
        .update({ is_adult: true, adult_verified_at: new Date().toISOString() })
        .eq('id', userId)
        .eq('is_adult', false)
        .select('*')
        .maybeSingle();
      if (error) throw new AppError('INTERNAL');
      if (!data) throw new AppError('CONFLICT');
      return { status: 200, body: profileSchema.parse(data) };
    },
  });
  defineRoute(context, {
    method: 'post',
    path: '/me/consents',
    rateLimit: { key: 'me_consents', by: 'user' },
    auth: 'required',
    request: { ...request, body: consentRequestSchema },
    response: { 200: consentsResponseSchema },
    handler: async ({ body }) => {
      const { userId } = caller();
      const { error } = await service().schema('app').rpc('record_consent', {
        p_user_id: userId,
        p_kind: body.kind,
        p_version: body.version,
        p_granted: body.granted,
        p_source: body.source,
      });
      if (error) throw new AppError('INTERNAL');
      return {
        status: 200,
        body: { consents: await latestConsents(service, userId) },
      };
    },
  });
}
