import { useEffect, useState } from 'react';
import { z } from '../../src/validation';
import { auth } from '../../src/auth/client';
import { useApp } from '../../src/state';
import {
  Screen,
  Copy,
  PrimaryButton,
  Field,
  ErrorNotice,
  CodeInput,
  LinkButton,
} from '../../src/ui';
import { cooldownTime } from '../../src/ui/logic';
export default function SignIn() {
  const { t, locale } = useApp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!seconds) return;
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
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await auth.signInWithOtp({
        email,
        options: { data: { locale } },
      });
      if (result.error)
        setError(
          t(
            result.error.status === 429
              ? 'errors.RATE_LIMITED'
              : 'web.authError',
          ),
        );
      else {
        setSent(true);
        setSeconds(60);
        setCode('');
      }
    } catch {
      setError(t('web.authError'));
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (busy) return;
    if (!/^\d{6}$/.test(code)) {
      setError(t('web.otpError'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      });
      if (result.error)
        setError(
          t(
            result.error.status === 429
              ? 'errors.RATE_LIMITED'
              : 'web.otpError',
          ),
        );
    } catch {
      setError(t('web.authError'));
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
    <Screen
      brand={!sent}
      onBack={sent ? changeEmail : undefined}
      footer={
        <>
          <ErrorNotice message={error} />
          <PrimaryButton
            testID={sent ? 'verify-code' : 'send-code'}
            title={t(sent ? 'web.verify' : 'web.sendCode')}
            busy={busy}
            onPress={() => {
              void (sent ? verify() : send());
            }}
          />
          {sent && (
            <LinkButton title={t('web.changeEmail')} onPress={changeEmail} />
          )}
        </>
      }
    >
      <Copy title>{t(sent ? 'ui.codeTitle' : 'ui.signInTitle')}</Copy>
      <Copy>{t(sent ? 'ui.codeHelp' : 'ui.signInHelp')}</Copy>
      {sent ? (
        <>
          <Copy variant="label">{email}</Copy>
          <CodeInput value={code} onChange={setCode} error={error} />
          {seconds > 0 ? (
            <Copy variant="caption">
              {t('ui.resendTime', { time: cooldownTime(seconds) })}
            </Copy>
          ) : (
            <LinkButton
              title={t('web.resend')}
              onPress={() => {
                void send();
              }}
            />
          )}
        </>
      ) : (
        <Field
          testID="email"
          label={t('web.email')}
          placeholder={t('ui.emailExample')}
          error={error}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}
    </Screen>
  );
}
