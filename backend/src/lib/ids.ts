import { randomBytes, randomUUID } from 'node:crypto';
export const newToken = (): string => randomBytes(16).toString('base64url');
export const newCorrelationId = (): string => randomUUID();
