'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatMessage as t, type Locale } from '@songsmith/i18n';
import {
  notificationsResponseSchema,
  notificationPrefsSchema,
  creativeKinds,
  type Notification,
  type NotificationPrefs,
} from '@songsmith/schemas';
import { browserAuth, browserRealtime } from '../lib/auth-browser';
import { clientApi } from './create/shared';
function useNotificationSignal(locale: Locale, load: () => Promise<void>) {
  useEffect(() => {
    let stopped = false;
    let unsubscribe: (() => void) | undefined;
    void load();
    void browserAuth()
      .getSession()
      .then(({ data }) => {
        if (stopped || !data.session) return;
        unsubscribe = browserRealtime().onNotificationsChange(
          data.session.user.id,
          () => void load(),
        );
      })
      .catch(() => undefined);
    const timer = setInterval(() => void load(), 30000);
    const changed = () => void load();
    window.addEventListener('notifications-read', changed);
    return () => {
      stopped = true;
      clearInterval(timer);
      unsubscribe?.();
      window.removeEventListener('notifications-read', changed);
    };
  }, [locale, load]);
}
export function NotificationBell({ locale }: { locale: Locale }) {
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    try {
      const r = await clientApi(locale).GET('/v1/me/notifications', {
        params: { query: { limit: 1 } },
      });
      if (r.data) setUnread(r.data.unread);
    } catch {
      /* Polling retries. */
    }
  }, [locale]);
  useNotificationSignal(locale, load);
  return (
    <Link
      className="notification-bell"
      href={`/${locale}/notifications`}
      aria-label={t(locale, 'notification.bell', { count: unread })}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </svg>
      <span
        aria-live="polite"
        aria-atomic="true"
        className="notification-count"
      >
        {unread > 0 ? unread : ''}
      </span>
    </Link>
  );
}
export function NotificationCentre({ locale }: { locale: Locale }) {
  const [items, setItems] = useState<Notification[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  const expanded = useRef(false);
  const load = useCallback(async () => {
    try {
      const r = await clientApi(locale).GET('/v1/me/notifications', {
        params: { query: { limit: 20 } },
      });
      if (!r.data) throw new Error();
      const parsed = notificationsResponseSchema.parse(r.data);
      setItems((old) => {
        const fresh = new Map(parsed.items.map((i) => [i.id, i]));
        return [...parsed.items, ...old.filter((i) => !fresh.has(i.id))].sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
        );
      });
      if (!expanded.current) setCursor(parsed.nextCursor);
      setLoaded(true);
      setError(false);
    } catch {
      setError(true);
    }
  }, [locale]);
  useNotificationSignal(locale, load);
  async function read(ids?: string[]) {
    setBusy(true);
    try {
      const r = await clientApi(locale).POST('/v1/me/notifications/read', {
        body: ids ? { ids } : { all: true },
      });
      if (r.error) throw new Error();
      setItems((old) =>
        old.map((i) =>
          !ids || ids.includes(i.id)
            ? { ...i, readAt: new Date().toISOString() }
            : i,
        ),
      );
      window.dispatchEvent(new Event('notifications-read'));
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!cursor) return;
    expanded.current = true;
    setBusy(true);
    try {
      const r = await clientApi(locale).GET('/v1/me/notifications', {
        params: { query: { cursor, limit: 20 } },
      });
      if (!r.data) throw new Error();
      const parsed = notificationsResponseSchema.parse(r.data);
      setItems((old) => [
        ...old,
        ...parsed.items.filter((i) => !old.some((o) => o.id === i.id)),
      ]);
      setCursor(parsed.nextCursor);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="studio-card notification-centre">
      <div className="notification-heading">
        <h1>{t(locale, 'notification.title')}</h1>
        {items.length > 0 && (
          <button
            className="secondary"
            disabled={busy || !items.some((i) => !i.readAt)}
            onClick={() => void read()}
          >
            {t(locale, 'notification.markAll')}
          </button>
        )}
      </div>
      {error && <p role="alert">{t(locale, 'notification.error')}</p>}
      {!loaded && !error && (
        <p role="status">{t(locale, 'notification.loading')}</p>
      )}
      {loaded && !items.length && (
        <div className="notification-empty create-panel">
          <span className="status-chip" aria-hidden="true">
            ♪
          </span>
          <h2>{t(locale, 'notification.empty')}</h2>
          <p>{t(locale, 'notification.emptyBody')}</p>
          <Link className="button primary-button" href={`/${locale}/create`}>
            {t(locale, 'create.title')}
          </Link>
        </div>
      )}
      <ul className="notification-list">
        {items.map((item) => (
          <li key={item.id} className={item.readAt ? '' : 'unread'}>
            <button
              className="notification-row"
              disabled={busy}
              onClick={() => {
                void read([item.id]).then((ok) => {
                  if (ok && item.kind.startsWith('song_') && item.payload.jobId)
                    router.push(`/${locale}/create/jobs/${item.payload.jobId}`);
                });
              }}
            >
              <span className="notification-kind">
                {t(locale, `notification.kind.${item.kind}`)}
                {!item.readAt && (
                  <span
                    className="unread-dot"
                    aria-label={t(locale, 'notification.unread')}
                  />
                )}
              </span>
              <span>
                {t(locale, `notification.text.${item.kind}`, {
                  title: item.payload.title ?? '',
                })}
              </span>
              <time dateTime={item.createdAt}>
                {new Intl.RelativeTimeFormat(locale, {
                  numeric: 'auto',
                }).format(
                  -Math.max(
                    0,
                    Math.floor(
                      (Date.now() - Date.parse(item.createdAt)) / 60000,
                    ),
                  ),
                  'minute',
                )}
              </time>
            </button>
          </li>
        ))}
      </ul>
      {cursor && (
        <button disabled={busy} onClick={() => void more()}>
          {t(locale, 'notification.more')}
        </button>
      )}
    </section>
  );
}
export function NotificationSettings({ locale }: { locale: Locale }) {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null),
    [marketing, setMarketing] = useState(false),
    [status, setStatus] = useState<'saved' | 'error' | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let stopped = false;
    void clientApi(locale)
      .GET('/v1/me')
      .then((r) => {
        if (stopped) return;
        if (!r.data) throw new Error();
        setPrefs(
          notificationPrefsSchema.parse(r.data.settings.notification_prefs),
        );
        setMarketing(r.data.settings.marketing_email_opt_in);
      })
      .catch(() => {
        if (!stopped) setStatus('error');
      });
    return () => {
      stopped = true;
    };
  }, [locale]);
  async function save() {
    if (!prefs) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await clientApi(locale).PUT('/v1/me/settings', {
        body: { notificationPrefs: prefs, marketingEmailOptIn: marketing },
      });
      if (r.error) throw new Error();
      setStatus('saved');
    } catch {
      setStatus('error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="notification-settings">
      <h2>{t(locale, 'notification.settings')}</h2>
      {prefs ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy}>
            <legend>{t(locale, 'notification.email')}</legend>
            <p className="caption">{t(locale, 'notification.transactional')}</p>
            {creativeKinds.map((kind) => (
              <label className="toggle-row notification-toggle" key={kind}>
                <span>{t(locale, `notification.email.${kind}`)}</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={prefs.email[kind]}
                  onChange={(e) => {
                    setStatus(null);
                    setPrefs({
                      ...prefs,
                      email: { ...prefs.email, [kind]: e.target.checked },
                    });
                  }}
                />
              </label>
            ))}
          </fieldset>
          <fieldset disabled={busy}>
            <legend>{t(locale, 'notification.push')}</legend>
            <p className="caption">{t(locale, 'notification.pushNote')}</p>
            {creativeKinds.map((kind) => (
              <label className="toggle-row notification-toggle" key={kind}>
                <span>{t(locale, `notification.kind.${kind}`)}</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={prefs.push[kind]}
                  onChange={(e) => {
                    setStatus(null);
                    setPrefs({
                      ...prefs,
                      push: { ...prefs.push, [kind]: e.target.checked },
                    });
                  }}
                />
              </label>
            ))}
          </fieldset>
          <label className="toggle-row notification-toggle">
            <span>{t(locale, 'notification.marketing')}</span>
            <input
              type="checkbox"
              role="switch"
              disabled={busy}
              checked={marketing}
              onChange={(e) => {
                setMarketing(e.target.checked);
                setStatus(null);
              }}
            />
          </label>
          <button className="primary-button" disabled={busy}>
            {t(locale, 'notification.save')}
          </button>
        </form>
      ) : (
        !status && <p role="status">{t(locale, 'notification.loading')}</p>
      )}
      <p role={status === 'error' ? 'alert' : 'status'}>
        {status ? t(locale, `notification.${status}`) : ''}
      </p>
    </section>
  );
}
