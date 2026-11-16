import { NotificationCentre } from '../../../../components/notifications';
import { requireStage } from '../../../../lib/session';
import { pageLocale, type PageProps } from '../../../../lib/page';
export default async function Page({ params }: PageProps) {
  const locale = await pageLocale(params);
  await requireStage(locale, 'home');
  return (
    <main id="main">
      <NotificationCentre locale={locale} />
    </main>
  );
}
