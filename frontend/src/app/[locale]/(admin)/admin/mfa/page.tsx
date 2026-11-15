import { redirect } from 'next/navigation';
import { MfaForm } from '../../../../../components/admin/mfa-form';
import { adminSession } from '../../../../../lib/admin';
import { pageLocale, type PageProps } from '../../../../../lib/page';
export default async function Page({ params }: PageProps) {
  const locale = await pageLocale(params);
  const session = await adminSession(locale);
  if (session.state === 'signed-out') redirect(`/${locale}/sign-in`);
  if (session.state === 'staff') redirect(`/${locale}/admin/catalogue`);
  return (
    <main id="main" className="auth-main">
      <MfaForm locale={locale} />
    </main>
  );
}
