import { errorResponseSchema, errorCatalogue } from './validation';
import { formatMessage, type Locale } from '@songsmith/i18n';
export function errorCode(error: unknown) {
  const parsed = errorResponseSchema.safeParse(error);
  return parsed.success ? parsed.data.error.code : 'INTERNAL';
}
export function errorMessage(locale: Locale, error: unknown) {
  return formatMessage(locale, errorCatalogue[errorCode(error)].messageKey);
}
