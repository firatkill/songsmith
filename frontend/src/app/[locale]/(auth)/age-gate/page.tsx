import { AgeGate } from '../../../../components/auth-forms';
import { requireStage } from '../../../../lib/session';
import { pageLocale, type PageProps } from '../../../../lib/page';
export default async function Page({ params }: PageProps) {
  const locale = await pageLocale(params);
  await requireStage(locale, 'age-gate');
  return (
    <main id="main">
      <AgeGate locale={locale} />
    </main>
  );
}
