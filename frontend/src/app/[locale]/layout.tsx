import { Bricolage_Grotesque, Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { tokensCss, systemTokensCss } from '@songsmith/ui-tokens';
import { formatMessage as t } from '@songsmith/i18n';
import { pageLocale, type PageProps } from '../../lib/page';
import '../globals.css';
const displayFont = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '800'],
  display: 'swap',
  variable: '--font-display',
});
const bodyFont = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-body',
});
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: PageProps) {
  const locale = await pageLocale(params);
  return { title: t(locale, 'web.brand'), description: t(locale, 'web.intro') };
}
export default async function Layout({
  children,
  params,
}: PageProps & { children: ReactNode }) {
  const locale = await pageLocale(params);
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html
      lang={locale}
      className={`${displayFont.variable} ${bodyFont.variable}`}
    >
      <head>
        <style nonce={nonce}>{tokensCss + systemTokensCss}</style>
      </head>
      <body>
        <a className="skip" href="#main">
          {t(locale, 'web.skip')}
        </a>
        {children}
        <footer>
          <p>{t(locale, 'web.preview')}</p>
        </footer>
      </body>
    </html>
  );
}
