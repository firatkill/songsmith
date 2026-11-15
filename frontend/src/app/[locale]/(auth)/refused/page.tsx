import Link from 'next/link';
import { formatMessage as t } from '@songsmith/i18n';
import { pageLocale, type PageProps } from '../../../../lib/page';
export default async function Refused({ params }: PageProps) {
  const locale = await pageLocale(params);
  return (
    <main id="main">
      <section className="auth-card refused-card">
        <h1>{t(locale, 'web.refusalTitle')}</h1>
        <p>{t(locale, 'web.refusal')}</p>
        <Link className="link-button" href={`/${locale}/sign-in`}>
          {t(locale, 'ui.backSignIn')}
        </Link>
      </section>
    </main>
  );
}
