import type { ReactNode } from 'react';
import { Header, Navigation } from '../../../components/header';
import { requireStage } from '../../../lib/session';
import { pageLocale, type PageProps } from '../../../lib/page';
export default async function AppLayout({
  params,
  children,
}: PageProps & { children: ReactNode }) {
  const locale = await pageLocale(params);
  await requireStage(locale, 'home');
  return (
    <>
      <Header locale={locale} signedIn />
      <div className="app-bar">
        <Navigation locale={locale} />
      </div>
      {children}
    </>
  );
}
