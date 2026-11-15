import type { ReactNode } from 'react';
import { Header } from '../../../components/header';
import { pageLocale, type PageProps } from '../../../lib/page';
export default async function AdminRootLayout({
  children,
  params,
}: PageProps & { children: ReactNode }) {
  const locale = await pageLocale(params);
  return (
    <div className="admin-shell">
      <Header locale={locale} signedIn />
      {children}
    </div>
  );
}
