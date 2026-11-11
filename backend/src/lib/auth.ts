import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import {
  consentRowSchema,
  consentVersions,
  jwtClaimsSchema,
  profileSchema,
  type ConsentKind,
} from '@songsmith/schemas';
import { AppError } from './errors.js';
import { requestContext } from './correlation.js';
import type { lazyServiceClient } from '../db/client.js';

export type Service = ReturnType<typeof lazyServiceClient>;
export function createJwtClaimsVerifier(
  issuer: string,
  jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),
) {
  return async (token: string) => {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: 'authenticated',
        algorithms: ['ES256', 'RS256'],
        requiredClaims: ['exp', 'sub', 'role'],
      });
      return { sub: jwtClaimsSchema.parse(payload).sub, aal: payload['aal'] };
    } catch {
      throw new AppError('UNAUTHENTICATED');
    }
  };
}
export function createJwtVerifier(
  issuer: string,
  jwks?: Parameters<typeof createJwtClaimsVerifier>[1],
) {
  const verify = createJwtClaimsVerifier(issuer, jwks);
  return async (token: string) => (await verify(token)).sub;
}
export function requireStaff(service: Service, issuer: string): RequestHandler {
  const verify = createJwtClaimsVerifier(issuer);
  return async (req, _res, next) => {
    const token = /^Bearer ([^\s]+)$/i.exec(
      req.get('authorization') ?? '',
    )?.[1];
    if (!token) throw new AppError('UNAUTHENTICATED');
    const claims = await verify(token);
    if (claims.aal !== 'aal2') throw new AppError('FORBIDDEN');
    const result = await service()
      .schema('app')
      .from('staff_roles')
      .select('id')
      .eq('user_id', claims.sub)
      .limit(1);
    if (result.error) throw new AppError('INTERNAL');
    if (!result.data.length) throw new AppError('FORBIDDEN');
    const store = requestContext.getStore();
    if (store) store.userId = claims.sub;
    next();
  };
}
export function authStage(
  verify: (token: string) => Promise<string>,
): RequestHandler {
  return async (req, _res, next) => {
    const store = requestContext.getStore();
    if (!store || !store.authMode || store.authMode === 'public') {
      next();
      return;
    }
    const header = req.get('authorization');
    if (header === undefined && store.authMode === 'optional') {
      next();
      return;
    }
    const match = /^Bearer ([^\s]+)$/i.exec(header ?? '');
    if (!match?.[1]) throw new AppError('UNAUTHENTICATED');
    store.userId = await verify(match[1]);
    next();
  };
}
export function profileStage(service: Service): RequestHandler {
  return async (_req, _res, next) => {
    const store = requestContext.getStore();
    if (!store?.userId) {
      next();
      return;
    }
    const { data, error } = await service()
      .from('profiles')
      .select('*')
      .eq('id', store.userId)
      .maybeSingle();
    if (error) throw new AppError('INTERNAL');
    if (!data) {
      // Deleted accounts can retain unexpired JWTs. Only probe Auth when the
      // profile is missing; an existing identity means provisioning is broken.
      const lookup = await service().auth.admin.getUserById(store.userId);
      if (lookup.error?.code === 'user_not_found')
        throw new AppError('UNAUTHENTICATED');
      // Includes lookup failures: do not disguise an Auth outage as sign-out.
      throw new AppError('INTERNAL');
    }
    const profile = profileSchema.parse(data);
    if (profile.status === 'deleted') throw new AppError('UNAUTHENTICATED');
    if (profile.status === 'banned') throw new AppError('FORBIDDEN');
    store.profile = profile;
    if (!profile.is_adult && !store.ageGateAllowed)
      throw new AppError('NOT_ADULT');
    next();
  };
}
export function caller() {
  const store = requestContext.getStore();
  if (!store?.userId || !store.profile) throw new AppError('UNAUTHENTICATED');
  return { userId: store.userId, profile: store.profile };
}
export async function latestConsents(service: Service, userId: string) {
  // One bounded query per kind: PostgREST's row cap must not hide older kinds.
  const rows = await Promise.all(
    Object.keys(consentVersions).map(async (kind) => {
      const { data, error } = await service()
        .from('consents')
        .select('*')
        .eq('user_id', userId)
        .eq('kind', kind)
        .order('at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);
      if (error) throw new AppError('INTERNAL');
      return z.array(consentRowSchema).parse(data);
    }),
  );
  return rows.flat().map((row) => ({
    ...row,
    isCurrent: row.version === consentVersions[row.kind],
  }));
}
export function requireConsent(kind: ConsentKind) {
  return async (service: Service, userId = caller().userId): Promise<void> => {
    const rows = await latestConsents(service, userId);
    if (!rows.some((row) => row.kind === kind && row.isCurrent && row.granted))
      throw new AppError('CONSENT_REQUIRED', { kind });
  };
}
// Calendar comparison in UTC. A 29 February birthday reaches 18 on 1 March
// when the anniversary year is not a leap year.
export function isAdult(dateOfBirth: string, today = new Date()): boolean {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  const year = today.getUTCFullYear() - birth.getUTCFullYear();
  return (
    year > 18 ||
    (year === 18 &&
      (today.getUTCMonth() > birth.getUTCMonth() ||
        (today.getUTCMonth() === birth.getUTCMonth() &&
          today.getUTCDate() >= birth.getUTCDate())))
  );
}
