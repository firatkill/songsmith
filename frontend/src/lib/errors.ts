import {
  errorCatalogue,
  errorResponseSchema,
  type ErrorCode,
} from './validation';
import { formatMessage, type Locale } from '@songsmith/i18n';
export function apiErrorCode(error: unknown): ErrorCode {
  const parsed = errorResponseSchema.safeParse(error);
  return parsed.success ? parsed.data.error.code : 'INTERNAL';
}
export function apiErrorMessage(locale: Locale, error: unknown): string {
  return formatMessage(locale, errorCatalogue[apiErrorCode(error)].messageKey);
}

// Only a catalogue code crosses the production server error boundary.
export class ApiFailure extends Error {
  readonly digest: string;
  constructor(code: ErrorCode) {
    super(code);
    this.digest = `songsmith:${code}`;
  }
}
