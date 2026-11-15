'use client';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { formatMessage as t, type Locale } from '@songsmith/i18n';
import { browserAuth } from '../../lib/auth-browser';
import { CodeInput, PrimaryButton } from '../auth-ui';

type Step =
  | { kind: 'loading' }
  | { kind: 'challenge'; factorId: string }
  | { kind: 'enroll'; factorId: string; qr: string; secret: string }
  | { kind: 'failed' };

// TOTP through Supabase Auth (auth only, TD-03). Verified factor: ask for a
// code. None yet: enrol a new one (QR plus a manual key) and verify it.
export function MfaForm({ locale }: { locale: Locale }) {
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Enrolment creates a factor, so it must run once even when effects run twice
  // (React StrictMode in development). Refs survive the remount.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const auth = browserAuth();
      const factors = await auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      const verified = factors.data.totp[0];
      if (verified) {
        setStep({ kind: 'challenge', factorId: verified.id });
        return;
      }
      // Abandoned enrolments block a new one with the same name; remove them.
      for (const factor of factors.data.all)
        if (factor.status === 'unverified')
          await auth.mfa.unenroll({ factorId: factor.id });
      const enrolled = await auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Songsmith admin',
      });
      if (enrolled.error) throw enrolled.error;
      setStep({
        kind: 'enroll',
        factorId: enrolled.data.id,
        qr: enrolled.data.totp.qr_code,
        secret: enrolled.data.totp.secret,
      });
    })().catch(() => {
      setStep({ kind: 'failed' });
    });
  }, []);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== 'challenge' && step.kind !== 'enroll') return;
    if (!/^\d{6}$/.test(code)) {
      setError(t(locale, 'admin.mfaError'));
      return;
    }
    setBusy(true);
    setError('');
    const result = await browserAuth()
      .mfa.challengeAndVerify({ factorId: step.factorId, code })
      .catch(() => ({ error: true }));
    if (result.error) {
      setBusy(false);
      setCode('');
      setError(t(locale, 'admin.mfaError'));
      return;
    }
    location.assign(`/${locale}/admin/catalogue`);
  }

  const body =
    step.kind === 'loading' ? (
      <p aria-live="polite">{t(locale, 'web.busy')}</p>
    ) : step.kind === 'failed' ? (
      <p className="alert" role="alert">
        {t(locale, 'web.authError')}
      </p>
    ) : (
      <>
        <p>
          {t(
            locale,
            step.kind === 'enroll'
              ? 'admin.mfaEnrollHelp'
              : 'admin.mfaChallengeHelp',
          )}
        </p>
        {step.kind === 'enroll' && (
          <div className="mfa-enroll">
            {/* Supabase returns the QR as an SVG data URI (allowed by img-src data:). */}
            <img
              className="mfa-qr"
              src={step.qr}
              alt={t(locale, 'admin.qrAlt')}
              width={180}
              height={180}
            />
            <p className="caption">{t(locale, 'admin.mfaSecret')}</p>
            <code className="mfa-secret" data-testid="totp-secret">
              {step.secret}
            </code>
          </div>
        )}
        <form
          method="post"
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <CodeInput
            locale={locale}
            value={code}
            onChange={(value) => {
              setCode(value);
              setError('');
            }}
            error={error}
          />
          <div className="auth-footer">
            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}
            <PrimaryButton busy={busy}>
              {t(locale, 'admin.mfaVerify')}
            </PrimaryButton>
          </div>
        </form>
      </>
    );
  return (
    <section className="auth-card">
      <h1>{t(locale, 'admin.mfaTitle')}</h1>
      {body}
    </section>
  );
}
