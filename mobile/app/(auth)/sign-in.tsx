import { useEffect, useState } from 'react';
import { z } from '../../src/validation';
import { auth } from '../../src/auth/client';
import { useApp } from '../../src/state';
import { Screen, Copy, Button, Field, ErrorNotice } from '../../src/ui';
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
  return (
    <Screen>
      <Copy title>{t('web.signIn')}</Copy>
      {sent ? (
        <>
          <Copy>{t('web.codeSent')}</Copy>
          <Field
            testID="otp-code"
            label={t('web.code')}
            value={code}
            onChangeText={(value) => {
              setCode(value.replace(/\D/g, '').slice(0, 6));
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={6}
          />
        </>
      ) : (
        <Field
          testID="email"
          label={t('web.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}
      <ErrorNotice message={error} />
      <Button
        testID={sent ? 'verify-code' : 'send-code'}
        disabled={busy}
        title={t(busy ? 'web.busy' : sent ? 'web.verify' : 'web.sendCode')}
        onPress={() => {
          void (sent ? verify() : send());
        }}
      />
      {sent && (
        <>
          <Button
            disabled={busy || seconds > 0}
            title={seconds ? t('web.cooldown', { seconds }) : t('web.resend')}
            onPress={() => {
              void send();
            }}
          />
          <Button
            disabled={busy}
            title={t('web.changeEmail')}
            onPress={() => {
              setSent(false);
              setCode('');
              setError('');
            }}
          />
        </>
      )}
    </Screen>
  );
}
