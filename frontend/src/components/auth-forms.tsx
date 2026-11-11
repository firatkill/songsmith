'use client';
import { useEffect, useState, type SubmitEvent } from 'react';
import { formatMessage as t, type Locale } from '@songsmith/i18n';
import { z, consentVersions, type ConsentKind } from '../lib/validation';
import { birthDateOrder, parseBirthDate } from '../lib/birth-date';
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
  return (
    <section className="card card-accent">
      <h1>{t(locale, 'web.signIn')}</h1>
      <form
        method="post"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        {!sent ? (
          <label>
            {t(locale, 'web.email')}
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </label>
        ) : (
          <>
            <p role="status">{t(locale, 'web.codeSent')}</p>
            <label>
              {t(locale, 'web.code')}
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                }}
              />
            </label>
          </>
        )}
        <ErrorNotice message={error} />
        <button disabled={busy} type="submit">
          {t(locale, busy ? 'web.busy' : sent ? 'web.verify' : 'web.sendCode')}
        </button>
        {sent && (
          <>
            <button
              className="secondary"
              type="button"
              disabled={busy || seconds > 0}
              onClick={() => {
                void send();
              }}
            >
              {seconds > 0
                ? t(locale, 'web.cooldown', { seconds })
                : t(locale, 'web.resend')}
            </button>
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                setSent(false);
                setCode('');
                setError('');
              }}
            >
              {t(locale, 'web.changeEmail')}
            </button>
          </>
        )}
      </form>
    </section>
  );
}
export function AgeGate({ locale }: { locale: Locale }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <section className="card">
      <h1>{t(locale, 'web.ageTitle')}</h1>
      <p id="age-help">{t(locale, 'web.ageHelp')}</p>
      <form
        method="post"
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <fieldset
          className="birth-date"
          aria-describedby={error ? 'age-help birth-error' : 'age-help'}
        >
          <legend>{t(locale, 'web.birthDate')}</legend>
          <div className="date-fields">
            {birthDateOrder(locale).map((part) => (
              <label key={part}>
                {t(locale, `web.${part}`)}
                <input
                  name={part}
                  type="text"
                  inputMode="numeric"
                  autoComplete={`bday-${part}`}
                  maxLength={part === 'year' ? 4 : 2}
                  required
                  aria-invalid={error === t(locale, 'web.birthDateError')}
                  aria-describedby={error ? 'birth-error' : undefined}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <ErrorNotice message={error} id="birth-error" />
        <button disabled={busy}>
          {t(locale, busy ? 'web.busy' : 'web.continue')}
        </button>
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      for (const kind of kinds) {
        const result = await browserApi(locale).POST('/v1/me/consents', {
          body: {
            kind,
            version: consentVersions[kind],
            granted: data.get(kind) === 'on',
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
    <section className="card">
      <h1>{t(locale, 'web.consentTitle')}</h1>
      <p className="notice">{t(locale, 'web.provisional')}</p>
      <p id="ai-disclosure">{t(locale, 'web.disclosure')}</p>
      <form
        method="post"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <fieldset className="consent-group">
          <legend>{t(locale, 'web.requiredConsents')}</legend>
          {kinds.slice(0, 3).map((kind) => (
            <label className="check" key={kind}>
              <input
                type="checkbox"
                name={kind}
                required
                aria-describedby={
                  kind === 'ai_disclosure' ? 'ai-disclosure' : undefined
                }
              />
              {t(locale, `web.${kind}`)}
            </label>
          ))}
        </fieldset>
        <fieldset className="consent-group" aria-describedby="optional-help">
          <legend>{t(locale, 'web.optionalConsents')}</legend>
          <p id="optional-help">{t(locale, 'web.optionalHelp')}</p>
          {kinds.slice(3).map((kind) => (
            <label className="check" key={kind}>
              <input type="checkbox" name={kind} />
              {t(locale, `web.${kind}`)}
            </label>
          ))}
        </fieldset>
        <ErrorNotice message={error} />
        <button disabled={busy}>
          {t(locale, busy ? 'web.busy' : 'web.continue')}
        </button>
      </form>
    </section>
  );
}
