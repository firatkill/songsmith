import { notFound } from 'next/navigation';
import { formatMessage as t } from '@songsmith/i18n';
import { FlagsEditor } from '../../../../../../components/admin/flags-editor';
import { adminSession } from '../../../../../../lib/admin';
import { ApiFailure, apiErrorCode } from '../../../../../../lib/errors';
import { pageLocale, type PageProps } from '../../../../../../lib/page';
export default async function Page({ params }: PageProps) {
  const locale = await pageLocale(params);
  const session = await adminSession(locale);
  if (session.state !== 'staff') notFound();
  const result = await session.client.GET('/v1/admin/flags', {
    cache: 'no-store',
  });
  if (result.error) throw new ApiFailure(apiErrorCode(result.error));
  return (
    <section className="studio-card admin-card">
      <h1>{t(locale, 'admin.flags')}</h1>
      <FlagsEditor locale={locale} initial={result.data.flags} />
    </section>
  );
}
