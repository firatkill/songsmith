import { redirect } from 'next/navigation';
import { SignIn } from '../../../../components/auth-forms';
import { currentMe } from '../../../../lib/session';
import { onboardingPath } from '../../../../lib/locale';
import { pageLocale, type PageProps } from '../../../../lib/page';
export default async function Page({ params }: PageProps) {
  const locale = await pageLocale(params);
  const me = await currentMe(locale);
  if (me) redirect(onboardingPath(locale, me));
  return (
    <main id="main">
      <SignIn locale={locale} />
    </main>
  );
}
