import { formatMessage as t } from '@songsmith/i18n';
import type { Metadata } from 'next';
import { CreateFlow } from '../../../../components/create/create-flow';
import { requireStage } from '../../../../lib/session';
import { pageLocale, type PageProps } from '../../../../lib/page';
import { loadCatalogue } from './catalogue';

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  return { title: t(await pageLocale(params), 'create.title') };
}
export default async function Page({ params }: PageProps) {
  const locale = await pageLocale(params);
  await requireStage(locale, 'home');
  const catalogue = await loadCatalogue(locale);
  return (
    <main id="main" className="create-main">
      <CreateFlow
        locale={locale}
        catalogue={{
          models: catalogue.models,
          lyricist: catalogue.lyricist
            ? {
                available: catalogue.lyricist.available,
                prices: catalogue.lyricist.prices,
              }
            : null,
        }}
      />
    </main>
  );
}
