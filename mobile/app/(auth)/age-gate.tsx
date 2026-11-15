import { useState } from 'react';
import { useApp } from '../../src/state';
import { api } from '../../src/api';
import { parseBirthDate } from '../../src/birth-date';
import { errorCode, errorMessage } from '../../src/errors';
import {
  Screen,
  Copy,
  PrimaryButton,
  DateFields,
  ErrorNotice,
} from '../../src/ui';
export default function AgeGate() {
  const { t, locale, refresh, refuse, signOut } = useApp();
  const [parts, setParts] = useState({ day: '', month: '', year: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (busy) return;
    const dateOfBirth = parseBirthDate(parts);
    if (!dateOfBirth) {
      setError(t('web.birthDateError'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api(locale).POST('/v1/me/age', {
        body: { dateOfBirth },
      });
      setParts({ day: '', month: '', year: '' });
      if (result.error) {
        if (errorCode(result.error) === 'NOT_ADULT') await refuse();
        else if (
          errorCode(result.error) === 'UNAUTHENTICATED' ||
          errorCode(result.error) === 'CONFLICT'
        )
          await refresh();
        else setError(errorMessage(locale, result.error));
      } else await refresh();
    } catch {
      setError(t('errors.INTERNAL'));
    } finally {
      setParts({ day: '', month: '', year: '' });
      setBusy(false);
    }
  }
  return (
    <Screen
      onBack={() => {
        if (!busy)
          void signOut().catch(() => {
            setError(t('web.authError'));
          });
      }}
      footer={
        <>
          <ErrorNotice message={error} />
          <PrimaryButton
            testID="submit-age"
            busy={busy}
            title={t('web.continue')}
            onPress={() => {
              void submit();
            }}
          />
        </>
      }
    >
      <Copy title>{t('web.ageTitle')}</Copy>
      <Copy>{t('web.ageHelp')}</Copy>
      <DateFields parts={parts} onChange={setParts} />
    </Screen>
  );
}
