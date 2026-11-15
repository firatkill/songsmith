'use client';
import { useRef, type ReactNode, type InputHTMLAttributes } from 'react';
import { formatMessage as t, type Locale } from '@songsmith/i18n';
import { birthDateOrder, type BirthDatePart } from '../lib/birth-date';
export function PrimaryButton({
  children,
  busy,
}: {
  children: ReactNode;
  busy: boolean;
}) {
  return (
    <button className="primary-button" type="submit" aria-busy={busy}>
      <span className={busy ? 'button-label-busy' : undefined}>{children}</span>
      {busy && <span className="button-spinner" aria-hidden="true" />}
    </button>
  );
}
export function LinkButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="link-button" onClick={onClick}>
      {children}
    </button>
  );
}
export function TextField({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="auth-field">
      {label}
      <input {...props} aria-invalid={Boolean(error)} />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
export function CodeInput({
  value,
  onChange,
  locale,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  error: string;
}) {
  return (
    <label className="auth-field">
      {t(locale, 'web.code')}
      <span className="code-control">
        <input
          className="code-input"
          aria-invalid={Boolean(error)}
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          value={value}
          onChange={(event) => {
            onChange(event.target.value.replace(/\D/g, '').slice(0, 6));
          }}
        />
        <span className="code-boxes" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} data-active={i === Math.min(value.length, 5)}>
              {value[i] ?? '\u00a0'}
            </span>
          ))}
        </span>
      </span>
    </label>
  );
}
export function DateFields({
  locale,
  invalid,
}: {
  locale: Locale;
  invalid: boolean;
}) {
  const refs = useRef<Partial<Record<BirthDatePart, HTMLInputElement | null>>>(
    {},
  );
  const order = birthDateOrder(locale);
  return (
    <fieldset className="birth-date">
      <legend className="visually-hidden">{t(locale, 'web.birthDate')}</legend>
      <div className="date-fields">
        {order.map((part, index) => (
          <label key={part}>
            {t(locale, `web.${part}`)}
            <input
              ref={(input) => {
                refs.current[part] = input;
              }}
              name={part}
              type="text"
              inputMode="numeric"
              autoComplete={`bday-${part}`}
              placeholder={t(locale, `ui.${part}Placeholder`)}
              maxLength={part === 'year' ? 4 : 2}
              aria-invalid={invalid}
              aria-describedby={invalid ? 'birth-error' : 'age-help'}
              onChange={(event) => {
                event.target.value = event.target.value.replace(/\D/g, '');
                const next = order[index + 1];
                if (
                  event.target.value.length === (part === 'year' ? 4 : 2) &&
                  next
                )
                  refs.current[next]?.focus();
              }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function ToggleRow({
  name,
  label,
  caption,
  invalid,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  caption?: string;
  invalid: boolean;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-row" data-invalid={invalid}>
      <span>
        <span className="toggle-label">{label}</span>
        {caption && <span className="caption">{caption}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        name={name}
        aria-label={label}
        checked={checked}
        aria-invalid={invalid}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
    </label>
  );
}
export function Group({
  children,
  required,
  label,
}: {
  children: ReactNode;
  required?: boolean;
  label: string;
}) {
  return (
    <fieldset className={`auth-group${required ? ' required' : ''}`}>
      <legend className="visually-hidden">{label}</legend>
      {children}
    </fieldset>
  );
}
