import { redirect } from 'next/navigation';
import { pageLocale, type PageProps } from '../../../../../lib/page';
export default async function Page({ params }: PageProps) {
  redirect(`/${await pageLocale(params)}/admin/catalogue`);
}
