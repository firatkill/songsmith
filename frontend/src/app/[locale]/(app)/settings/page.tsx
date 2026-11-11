import { formatMessage as t } from '@songsmith/i18n';
import { requireStage } from '../../../../lib/session';
import { pageLocale, type PageProps } from '../../../../lib/page';
export default async function Page({ params }: PageProps) {
  const locale = await pageLocale(params);
  await requireStage(locale, 'home');
  return (
    <main id="main">
      <section className="studio-card">
        <h1>{t(locale, 'web.settings')}</h1>
        <p className="status-chip">{t(locale, 'web.comingSoon')}</p>
        <p>{t(locale, 'web.placeholder')}</p>
      </section>
    </main>
  );
}
