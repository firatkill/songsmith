'use client';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  formatMessage as t,
  messages,
  type Locale,
  type MessageKey,
} from '@songsmith/i18n';
import { api } from '../../lib/api';
import { browserAuth } from '../../lib/auth-browser';
import { apiErrorCode, apiErrorMessage } from '../../lib/errors';

export function clientApi(locale: Locale) {
  return api(
    locale,
    async () => (await browserAuth().getSession()).data.session?.access_token,
  );
}
export function newIdempotencyKey() {
  return crypto.randomUUID();
}
export function hasMessage(locale: Locale, key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(messages[locale], key);
}
// FR-07: the category in plain language; FR-55 hard blocks stay generic.
export function moderationMessage(
  locale: Locale,
  action: 'block' | 'hard_block',
  category?: unknown,
) {
  if (action === 'hard_block') return t(locale, 'moderation.hardBlocked');
  const key = `moderation.blocked.${String(category)}`;
  return hasMessage(locale, key)
    ? t(locale, key)
    : t(locale, 'errors.MODERATION_BLOCKED');
}
export type Failure =
  | { kind: 'blocked'; message: string }
  | { kind: 'credits' }
  | { kind: 'error'; message: string };
// One mapping for lyricist and generate errors.
export function failure(locale: Locale, error: unknown): Failure {
  const code = apiErrorCode(error);
  if (code === 'INSUFFICIENT_CREDITS') return { kind: 'credits' };
  if (code === 'MODERATION_HARD_BLOCKED')
    return {
      kind: 'blocked',
      message: moderationMessage(locale, 'hard_block'),
    };
  if (code === 'MODERATION_BLOCKED') {
    const details =
      typeof error === 'object' && error && 'error' in error
        ? (error as { error: { details?: { category?: unknown } } }).error
            .details
        : undefined;
    return {
      kind: 'blocked',
      message: moderationMessage(locale, 'block', details?.category),
    };
  }
  return { kind: 'error', message: apiErrorMessage(locale, error) };
}

/**
 * Modal dialog on the native <dialog>: focus stays inside, Escape closes, and
 * focus returns to the control that opened it.
 */
export function Dialog({
  open,
  onClose,
  labelledBy,
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);
  const restore = useCallback(() => {
    const target = opener.current;
    if (target instanceof HTMLElement) target.focus();
    onClose();
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={labelledBy}
      onClose={restore}
      onCancel={(event) => {
        event.preventDefault();
        restore();
      }}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      {open ? children : null}
    </dialog>
  );
}

export function Credits({ locale, count }: { locale: Locale; count: number }) {
  return <>{t(locale, 'create.modelPrice', { count })}</>;
}
