import { formatMessage as t } from '@songsmith/i18n';
import { pageLocale, type PageProps } from '../../../../lib/page';
export default async function How({ params }: PageProps) {
  const locale = await pageLocale(params);
  return (
    <main id="main">
      <section className="studio-card">
        <h1>{t(locale, 'web.how')}</h1>
        <p className="status-chip">{t(locale, 'web.comingSoon')}</p>
        <p>{t(locale, 'web.placeholder')}</p>
      </section>
    </main>
  );
}
