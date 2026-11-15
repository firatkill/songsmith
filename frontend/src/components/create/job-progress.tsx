'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  formatMessage as t,
  type Locale,
  type MessageKey,
} from '@songsmith/i18n';
import { browserRealtime } from '../../lib/auth-browser';
import { apiErrorCode } from '../../lib/errors';
import { clearCreateDraft } from './create-flow';
import { clientApi } from './shared';

type Status =
  | 'queued'
  | 'moderating'
  | 'running'
  | 'finishing'
  | 'ready'
  | 'failed'
  | 'refunded'
  | 'cancelled';
interface Job {
  status: Status;
  modelId: string | null;
}
const STAGES = ['queued', 'running', 'finishing', 'ready'] as const;
const terminal = (s: Status) =>
  s === 'ready' || s === 'failed' || s === 'refunded' || s === 'cancelled';
const stageOf = (s: Status): (typeof STAGES)[number] =>
  s === 'moderating'
    ? 'queued'
    : s === 'queued' || s === 'running' || s === 'finishing'
      ? s
      : 'ready';

// FR-09 (web): live status with Realtime as a signal and 3 s polling as the
// fallback (A-08). The user can leave; the job keeps running.
export function JobProgress({
  locale,
  jobId,
  models,
}: {
  locale: Locale;
  jobId: string;
  models: Record<string, string>;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    async function load() {
      const result = await clientApi(locale)
        .GET('/v1/jobs/{id}', { params: { path: { id: jobId } } })
        .catch(() => undefined);
      if (stopped || !result) return false;
      if (result.data) {
        setJob({ status: result.data.status, modelId: result.data.modelId });
        if (result.data.status === 'ready') clearCreateDraft();
        return terminal(result.data.status);
      }
      if (apiErrorCode(result.error) === 'NOT_FOUND') {
        setMissing(true);
        return true;
      }
      return false;
    }
    async function poll() {
      const done = await load();
      if (stopped) return;
      if (done) {
        unsubscribe?.();
        return;
      }
      timer = setTimeout(() => void poll(), 3000);
    }
    try {
      unsubscribe = browserRealtime().onJobChange(jobId, () => void load());
    } catch {
      unsubscribe = undefined;
    }
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
    };
  }, [jobId, locale]);

  if (missing)
    return (
      <section className="studio-card job-card">
        <h1>{t(locale, 'job.title')}</h1>
        <p className="alert" role="alert">
          {t(locale, 'job.notFound')}
        </p>
        <Link className="button secondary" href={`/${locale}/create`}>
          {t(locale, 'job.newSong')}
        </Link>
      </section>
    );
  const status = job?.status ?? 'queued';
  const failed =
    status === 'failed' || status === 'refunded' || status === 'cancelled';
  const stage = stageOf(status);
  const reached = STAGES.indexOf(stage);
  const model = job?.modelId ? (models[job.modelId] ?? job.modelId) : null;
  return (
    <section className="studio-card job-card" aria-labelledby="job-title">
      <h1 id="job-title">{t(locale, 'job.title')}</h1>
      <p
        className="job-status"
        role="status"
        aria-live="polite"
        data-testid="job-status"
        data-status={status}
      >
        {failed
          ? t(locale, 'job.failed')
          : t(locale, `job.${stage}` as MessageKey)}
      </p>
      {failed ? null : (
        <ol className="job-stages" aria-label={t(locale, 'job.status')}>
          {STAGES.map((name, index) => (
            <li
              key={name}
              className={
                index < reached || stage === 'ready'
                  ? 'done'
                  : index === reached
                    ? 'active'
                    : undefined
              }
              aria-current={index === reached ? 'step' : undefined}
            >
              <span className="stepper-dot" aria-hidden="true" />
              <span>{t(locale, `job.${name}` as MessageKey)}</span>
            </li>
          ))}
        </ol>
      )}
      {model ? (
        <p
          className="caption"
          data-testid="job-model"
          data-model={job?.modelId ?? ''}
        >
          {t(locale, 'job.model', { model })}
        </p>
      ) : null}
      {terminal(status) ? null : (
        <p className="notice">{t(locale, 'job.leave')}</p>
      )}
      {status === 'ready' ? (
        <p className="caption">{t(locale, 'job.listenSoon')}</p>
      ) : null}
      <div className="create-actions">
        {failed ? (
          <Link
            className="button primary-button create-primary"
            href={`/${locale}/create`}
          >
            {t(locale, 'job.tryAgain')}
          </Link>
        ) : null}
        {status === 'ready' ? (
          <Link
            className="button primary-button create-primary"
            href={`/${locale}/create`}
          >
            {t(locale, 'job.newSong')}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
