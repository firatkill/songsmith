// Evaluate configuration before constructing any application or shared schemas.
import './zod-config';

export { z } from 'zod';
export {
  ageRequestSchema,
  consentVersions,
  errorCatalogue,
  errorCodeSchema,
  errorResponseSchema,
  meResponseSchema,
  type ConsentKind,
  type ErrorCode,
} from '@songsmith/schemas';
