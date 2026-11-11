'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { formatMessage as t, type Locale } from '@songsmith/i18n';
import { localizedPath } from '../lib/locale';
import { browserAuth } from '../lib/auth-browser';
export function Header({
  locale,
  signedIn = false,
}: {
  locale: Locale;
  signedIn?: boolean;
}) {
  const pathname = usePathname();
  return (
    <header>
      <Link className="brand" href={`/${locale}`}>
        {t(locale, 'web.brand')}
      </Link>
      <label className="locale">
        {t(locale, 'web.language')}
        <span className="select-control">
          <select
            value={locale}
            onChange={(event) => {
              const value = event.target.value === 'tr' ? 'tr' : 'en';
              document.cookie = `locale=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
              location.assign(
                localizedPath(pathname, value) +
                  location.search +
                  location.hash,
              );
            }}
          >
            <option value="en">{t(locale, 'web.en')}</option>
            <option value="tr">{t(locale, 'web.tr')}</option>
          </select>
        </span>
      </label>
      {signedIn && <Account locale={locale} />}
    </header>
  );
}
export function Account({ locale }: { locale: Locale }) {
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <details className="account">
      <summary>{t(locale, 'web.account')}</summary>
      <div className="account-panel">
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void browserAuth()
              .signOut({ scope: 'local' })
              .then(({ error }) => {
                if (error) {
                  setError(true);
                  setBusy(false);
                } else location.assign(`/${locale}/sign-in`);
              })
              .catch(() => {
                setError(true);
                setBusy(false);
              });
          }}
        >
          {t(locale, 'web.signOut')}
        </button>
        {error && (
          <p className="alert" role="alert">
            {t(locale, 'web.authError')}
          </p>
        )}
      </div>
    </details>
  );
}
export const destinations = [
  'create',
  'library',
  'explore',
  'wallet',
  'settings',
  'notifications',
] as const;
export function Navigation({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const links = (['home', ...destinations] as const).map((name) => (
    <Link
      key={name}
      href={`/${locale}/${name}`}
      aria-current={pathname === `/${locale}/${name}` ? 'page' : undefined}
    >
      {t(locale, `web.${name}`)}
    </Link>
  ));
  return (
    <>
      <nav className="desktop-nav" aria-label={t(locale, 'web.navigation')}>
        {links}
      </nav>
      <details className="navigation">
        <summary>{t(locale, 'web.menu')}</summary>
        <nav aria-label={t(locale, 'web.navigation')}>{links}</nav>
      </details>
    </>
  );
}
