import { cookies } from 'next/headers';
import { AppearanceSetting } from '../../../../components/appearance-setting';
import {
  appearanceFromCookie,
  appearanceCookieName,
} from '../../../../lib/appearance';
import { formatMessage as t } from '@songsmith/i18n';
import { requireStage } from '../../../../lib/session';
import { pageLocale, type PageProps } from '../../../../lib/page';
export default async function Page({ params }: PageProps) {
  const locale = await pageLocale(params);
  await requireStage(locale, 'home');
  return (
    <main id="main">
      <section className="studio-card">
        <h1>{t(locale, 'web.settings')}</h1>
        <AppearanceSetting
          locale={locale}
          initial={appearanceFromCookie(
            (await cookies()).get(appearanceCookieName)?.value,
          )}
        />
      </section>
    </main>
  );
}
