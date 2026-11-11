import Link from 'next/link';
import { formatMessage as t } from '@songsmith/i18n';
import { pageLocale, type PageProps } from '../../../../lib/page';
export default async function Refused({ params }: PageProps) {
  const locale = await pageLocale(params);
  return (
    <main id="main">
      <section className="card">
        <h1>{t(locale, 'web.refusalTitle')}</h1>
        <p>{t(locale, 'web.refusal')}</p>
        <Link href={`/${locale}`}>{t(locale, 'web.back')}</Link>
      </section>
    </main>
  );
}
