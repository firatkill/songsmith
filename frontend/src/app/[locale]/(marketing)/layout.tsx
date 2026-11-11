import type { ReactNode } from 'react';
import { Header } from '../../../components/header';
import { pageLocale, type PageProps } from '../../../lib/page';
export default async function Layout({
  children,
  params,
}: PageProps & { children: ReactNode }) {
  const locale = await pageLocale(params);
  return (
    <>
      <Header locale={locale} />
      {children}
    </>
  );
}
