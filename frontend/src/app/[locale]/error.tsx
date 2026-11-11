'use client';
import { errorCatalogue, errorCodeSchema } from '../../lib/validation';
import { useParams } from 'next/navigation';
import { formatMessage as t } from '@songsmith/i18n';
export default function ErrorPage({
  reset,
  error,
}: {
  reset: () => void;
  error: Error & { digest?: string };
}) {
  const params = useParams();
  const locale = params['locale'] === 'tr' ? 'tr' : 'en';
  const parsed = errorCodeSchema.safeParse(
    error.digest?.startsWith('songsmith:') ? error.digest.slice(10) : undefined,
  );
  const code = parsed.success ? parsed.data : 'INTERNAL';
  return (
    <main id="main">
      <section className="card">
        <h1>{t(locale, 'web.errorTitle')}</h1>
        <p className="alert" role="alert">
          {t(locale, errorCatalogue[code].messageKey)}
        </p>
        <button onClick={reset}>{t(locale, 'web.retry')}</button>
      </section>
    </main>
  );
}
