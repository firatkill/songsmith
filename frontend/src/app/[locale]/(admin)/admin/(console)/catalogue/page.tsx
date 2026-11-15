import { notFound } from 'next/navigation';
import { formatMessage as t } from '@songsmith/i18n';
import { CatalogueEditor } from '../../../../../../components/admin/catalogue-editor';
import { adminSession } from '../../../../../../lib/admin';
import { ApiFailure, apiErrorCode } from '../../../../../../lib/errors';
import { pageLocale, type PageProps } from '../../../../../../lib/page';
export default async function Page({ params }: PageProps) {
  const locale = await pageLocale(params);
  const session = await adminSession(locale);
  // The console layout has already redirected every non-staff state.
  if (session.state !== 'staff') notFound();
  const result = await session.client.GET('/v1/admin/catalogue', {
    cache: 'no-store',
  });
  if (result.error) throw new ApiFailure(apiErrorCode(result.error));
  return (
    <section className="studio-card admin-card">
      <h1>{t(locale, 'admin.catalogue')}</h1>
      <p className="caption">{t(locale, 'admin.catalogueHelp')}</p>
      <CatalogueEditor locale={locale} initial={result.data.models} />
    </section>
  );
}
