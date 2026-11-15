import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { formatMessage as t } from '@songsmith/i18n';
import { z } from 'zod';
import { JobProgress } from '../../../../../../components/create/job-progress';
import { requireStage } from '../../../../../../lib/session';
import { pageLocale } from '../../../../../../lib/page';
import { loadCatalogue } from '../../catalogue';

type Props = { params: Promise<{ locale: string; jobId: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(await pageLocale(params), 'job.title') };
}
export default async function Page({ params }: Props) {
  const locale = await pageLocale(params);
  await requireStage(locale, 'home');
  const { jobId } = await params;
  if (!z.uuid().safeParse(jobId).success) notFound();
  const catalogue = await loadCatalogue(locale);
  return (
    <main id="main" className="create-main">
      <JobProgress
        locale={locale}
        jobId={jobId}
        models={Object.fromEntries(
          catalogue.models.map((m) => [m.id, m.displayName]),
        )}
      />
    </main>
  );
}
