'use client';
import { useEffect, useState, type SubmitEvent } from 'react';
import { formatMessage as t, type Locale } from '@songsmith/i18n';
import { z, consentVersions, type ConsentKind } from '../lib/validation';
import {
  PrimaryButton,
  LinkButton,
  TextField,
  CodeInput,
  DateFields,
  ToggleRow,
  Group,
} from './auth-ui';
import { parseBirthDate } from '../lib/birth-date';
import { browserAuth } from '../lib/auth-browser';
import { api } from '../lib/api';
import { apiErrorCode, apiErrorMessage } from '../lib/errors';
function browserApi(locale: Locale) {
  return api(
    locale,
    async () => (await browserAuth().getSession()).data.session?.access_token,
  );
}
function ErrorNotice({ message, id }: { message: string; id?: string }) {
  return message ? (
    <p className="alert" id={id} role="alert">
      {message}
    </p>
  ) : null;
}
export function SignIn({ locale }: { locale: Locale }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => {
      setSeconds(seconds - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [seconds]);
  async function send() {
    if (busy) return;
    if (!z.email().safeParse(email).success) {
      setError(t(locale, 'errors.VALIDATION'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await browserAuth().signInWithOtp({
        email,
        options: { data: { locale } },
      });
      if (result.error) {
        setError(
          result.error.status === 429
            ? t(locale, 'errors.RATE_LIMITED')
            : t(locale, 'web.authError'),
        );
      } else {
        setSent(true);
        setSeconds(60);
        setCode('');
      }
    } catch {
      setError(t(locale, 'web.authError'));
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!sent) {
      await send();
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError(t(locale, 'web.otpError'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await browserAuth().verifyOtp({
        email,
        token: code,
        type: 'email',
      });
      if (result.error) setError(t(locale, 'web.otpError'));
      else location.assign(`/${locale}/home`);
    } catch {
      setError(t(locale, 'web.authError'));
    } finally {
      setBusy(false);
    }
  }
  function changeEmail() {
    if (!busy) {
      setSent(false);
      setCode('');
      setError('');
    }
  }
  return (
    <section className="auth-card">
      {sent && (
        <button
          className="back-button"
          type="button"
          aria-label={t(locale, 'ui.back')}
          onClick={changeEmail}
        >
          ←
        </button>
      )}
      <h1>{t(locale, sent ? 'ui.codeTitle' : 'ui.signInTitle')}</h1>
      <p>{t(locale, sent ? 'ui.codeHelp' : 'ui.signInHelp')}</p>
      {sent && <p className="email-destination">{email}</p>}
      <form
        method="post"
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        {!sent ? (
          <TextField
            label={t(locale, 'web.email')}
            type="email"
            autoComplete="email"
            placeholder={t(locale, 'ui.emailExample')}
            value={email}
            error={error}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        ) : (
          <>
            <CodeInput
              locale={locale}
              value={code}
              onChange={setCode}
              error={error}
            />
            {seconds > 0 ? (
              <p className="caption">
                {t(locale, 'ui.resendTime', {
                  time: `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`,
                })}
              </p>
            ) : (
              <LinkButton
                onClick={() => {
                  void send();
                }}
              >
                {t(locale, 'web.resend')}
              </LinkButton>
            )}
          </>
        )}
        <div className="auth-footer">
          <ErrorNotice message={error} />
          <PrimaryButton busy={busy}>
            {t(locale, sent ? 'web.verify' : 'web.sendCode')}
          </PrimaryButton>
          {sent && (
            <LinkButton onClick={changeEmail}>
              {t(locale, 'web.changeEmail')}
            </LinkButton>
          )}
        </div>
      </form>
    </section>
  );
}

export function AgeGate({ locale }: { locale: Locale }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const dateOfBirth = parseBirthDate({
      day: values.get('day'),
      month: values.get('month'),
      year: values.get('year'),
    });
    if (!dateOfBirth) {
      setError(t(locale, 'web.birthDateError'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await browserApi(locale).POST('/v1/me/age', {
        body: { dateOfBirth },
      });
      form.reset();
      if (result.error) {
        if (apiErrorCode(result.error) === 'NOT_ADULT') {
          await browserAuth().signOut({ scope: 'local' });
          location.replace(`/${locale}/refused`);
        } else setError(apiErrorMessage(locale, result.error));
      } else location.replace(`/${locale}/consent`);
    } catch {
      form.reset();
      setError(t(locale, 'errors.INTERNAL'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-card">
      <button
        className="back-button"
        type="button"
        aria-label={t(locale, 'ui.back')}
        onClick={() => {
          if (!busy) {
            setBusy(true);
            void browserAuth()
              .signOut({ scope: 'local' })
              .then((result) => {
                if (result.error) throw result.error;
                location.assign(`/${locale}/sign-in`);
              })
              .catch(() => {
                setError(t(locale, 'web.authError'));
                setBusy(false);
              });
          }
        }}
      >
        ←
      </button>
      <h1>{t(locale, 'web.ageTitle')}</h1>
      <p id="age-help">{t(locale, 'web.ageHelp')}</p>
      <form
        method="post"
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <DateFields
          locale={locale}
          invalid={error === t(locale, 'web.birthDateError')}
        />
        <div className="auth-footer">
          <ErrorNotice message={error} id="birth-error" />
          <PrimaryButton busy={busy}>{t(locale, 'web.continue')}</PrimaryButton>
        </div>
      </form>
    </section>
  );
}

const kinds: ConsentKind[] = [
  'terms',
  'privacy',
  'ai_disclosure',
  'marketing',
  'analytics',
];
export function Consent({ locale }: { locale: Locale }) {
  const [selected, setSelected] = useState<Record<ConsentKind, boolean>>({
    terms: false,
    privacy: false,
    ai_disclosure: false,
    marketing: false,
    analytics: false,
  });
  const [attempted, setAttempted] = useState(false);
  const missing = kinds.slice(0, 3).filter((kind) => !selected[kind]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (missing.length) {
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    try {
      for (const kind of kinds) {
        const result = await browserApi(locale).POST('/v1/me/consents', {
          body: {
            kind,
            version: consentVersions[kind],
            granted: selected[kind],
            source: 'web',
          },
        });
        if (result.error) {
          setError(apiErrorMessage(locale, result.error));
          return;
        }
      }
      location.replace(`/${locale}/home`);
    } catch {
      setError(t(locale, 'errors.INTERNAL'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-card">
      <h1>{t(locale, 'web.consentTitle')}</h1>
      <p>{t(locale, 'ui.consentHelp')}</p>
      <details className="auth-disclosure">
        <summary className="link-button">{t(locale, 'ui.disclosure')}</summary>
        <p className="caption">{t(locale, 'web.provisional')}</p>
        <p className="caption" id="ai-disclosure">
          {t(locale, 'web.disclosure')}
        </p>
      </details>
      <form
        method="post"
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <Group required label={t(locale, 'web.requiredConsents')}>
          {kinds.slice(0, 3).map((kind) => (
            <ToggleRow
              key={kind}
              name={kind}
              label={t(locale, `ui.${kind}`)}
              caption={t(locale, 'ui.required')}
              checked={selected[kind]}
              invalid={attempted && !selected[kind]}
              onChange={(value) => {
                if (!busy) setSelected({ ...selected, [kind]: value });
              }}
            />
          ))}
        </Group>
        <p className="overline">{t(locale, 'ui.optional')}</p>
        <Group label={t(locale, 'web.optionalConsents')}>
          {kinds.slice(3).map((kind) => (
            <ToggleRow
              key={kind}
              name={kind}
              label={t(locale, `ui.${kind}`)}
              checked={selected[kind]}
              invalid={false}
              onChange={(value) => {
                if (!busy) setSelected({ ...selected, [kind]: value });
              }}
            />
          ))}
        </Group>
        <div className="auth-footer">
          <ErrorNotice
            message={
              attempted && missing.length ? t(locale, 'ui.consentError') : error
            }
          />
          <PrimaryButton busy={busy}>{t(locale, 'ui.accept')}</PrimaryButton>
        </div>
      </form>
    </section>
  );
}
