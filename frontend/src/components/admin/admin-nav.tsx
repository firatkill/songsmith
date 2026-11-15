'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { formatMessage as t, type Locale } from '@songsmith/i18n';
export function AdminNav({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const items = [
    ['catalogue', 'admin.catalogue'],
    ['flags', 'admin.flags'],
  ] as const;
  return (
    <nav aria-label={t(locale, 'admin.nav')}>
      <span className="admin-nav-title">{t(locale, 'admin.title')}</span>
      {items.map(([path, key]) => {
        const href = `/${locale}/admin/${path}`;
        return (
          <Link
            key={path}
            href={href}
            aria-current={pathname === href ? 'page' : undefined}
          >
            {t(locale, key)}
          </Link>
        );
      })}
    </nav>
  );
}
