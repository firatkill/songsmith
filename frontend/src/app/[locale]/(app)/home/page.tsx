import { formatMessage as t } from '@songsmith/i18n';
import { requireStage } from '../../../../lib/session';
import { pageLocale, type PageProps } from '../../../../lib/page';
export default async function Home({ params }: PageProps) {
  const locale = await pageLocale(params);
  const me = await requireStage(locale, 'home');
  return (
    <main id="main">
      <section className="studio-card">
        <p className="eyebrow">{t(locale, 'web.home')}</p>
        <h1>{t(locale, 'web.welcome', { handle: me.profile.handle })}</h1>
        <p>{t(locale, 'web.placeholder')}</p>
      </section>
    </main>
  );
}
