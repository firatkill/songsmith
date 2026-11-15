import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatMessage as t } from '@songsmith/i18n';
import { AdminNav } from '../../../../../components/admin/admin-nav';
import { adminSession } from '../../../../../lib/admin';
import { pageLocale, type PageProps } from '../../../../../lib/page';
export default async function ConsoleLayout({
  children,
  params,
}: PageProps & { children: ReactNode }) {
  const locale = await pageLocale(params);
  const session = await adminSession(locale);
  if (session.state === 'signed-out') redirect(`/${locale}/sign-in`);
  if (session.state === 'needs-mfa') redirect(`/${locale}/admin/mfa`);
  if (session.state === 'forbidden')
    return (
      <main id="main" className="auth-main">
        <section className="auth-card">
          <h1>{t(locale, 'admin.noAccess')}</h1>
          <p>{t(locale, 'admin.noAccessHelp')}</p>
          <Link className="link-button" href={`/${locale}/home`}>
            {t(locale, 'admin.backHome')}
          </Link>
        </section>
      </main>
    );
  return (
    <>
      <div className="app-bar">
        <AdminNav locale={locale} />
      </div>
      <main id="main" className="admin-main">
        {children}
      </main>
    </>
  );
}
