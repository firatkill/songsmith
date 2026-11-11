import Link from 'next/link';
import { formatMessage as t } from '@songsmith/i18n';
import { pageLocale, type PageProps } from '../../../lib/page';
export default async function Landing({ params }: PageProps) {
  const locale = await pageLocale(params);
  const word = t(locale, 'web.pitchWord');
  const [before, after] = t(locale, 'web.pitch', { word: '{word}' }).split(
    '{word}',
  );
  return (
    <main id="main" className="hero">
      <p className="eyebrow">{t(locale, 'web.studio')}</p>
      <h1>
        {before}
        <span className="accent-word">{word}</span>
        {after}
      </h1>
      <p>{t(locale, 'web.intro')}</p>
      <ul className="chips">
        <li>{t(locale, 'web.chipIdeas')}</li>
        <li>{t(locale, 'web.chipLyrics')}</li>
        <li className="chip-pink">{t(locale, 'web.chipGift')}</li>
      </ul>
      <div className="actions">
        <Link className="button" href={`/${locale}/sign-in`}>
          {t(locale, 'web.signIn')}
        </Link>
        <Link href={`/${locale}/how-it-works`}>{t(locale, 'web.how')}</Link>
      </div>
    </main>
  );
}
