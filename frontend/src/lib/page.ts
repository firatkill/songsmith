import { notFound } from 'next/navigation';
import { isLocale } from './locale';
export type PageProps = { params: Promise<{ locale: string }> };
export async function pageLocale(params: PageProps['params']) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}
