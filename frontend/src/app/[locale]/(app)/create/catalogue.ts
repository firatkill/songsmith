import { catalogueSchema } from '@songsmith/schemas';
import type { Locale } from '@songsmith/i18n';
import { api } from '../../../../lib/api';
import { ApiFailure, apiErrorCode } from '../../../../lib/errors';
import '../../../../lib/validation';

// Public catalogue; the create flow builds its controls from it (FR-05).
export async function loadCatalogue(locale: Locale) {
  const result = await api(locale, () => undefined).GET('/v1/catalogue', {
    cache: 'no-store',
  });
  if (result.error) throw new ApiFailure(apiErrorCode(result.error));
  return catalogueSchema.parse(result.data);
}
