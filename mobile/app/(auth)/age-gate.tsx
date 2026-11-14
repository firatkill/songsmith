import { useState } from 'react';
import { useApp } from '../../src/state';
import { api } from '../../src/api';
import { birthDateOrder, parseBirthDate } from '../../src/birth-date';
import { errorCode, errorMessage } from '../../src/errors';
import { Screen, Copy, Button, Field, ErrorNotice } from '../../src/ui';
export default function AgeGate() {
  const { t, locale, refresh, refuse } = useApp();
  const [parts, setParts] = useState({ day: '', month: '', year: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
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
    <Screen>
      <Copy title>{t('web.ageTitle')}</Copy>
      <Copy>{t('web.ageHelp')}</Copy>
      {birthDateOrder(locale).map((part) => (
        <Field
          key={part}
          testID={`birth-${part}`}
          label={t(`web.${part}`)}
          value={parts[part]}
          onChangeText={(value) => {
            setParts({ ...parts, [part]: value.replace(/\D/g, '') });
          }}
          keyboardType="number-pad"
          maxLength={part === 'year' ? 4 : 2}
        />
      ))}
      <ErrorNotice message={error} />
      <Button
        testID="submit-age"
        disabled={busy}
        title={t(busy ? 'web.busy' : 'web.continue')}
        onPress={() => {
          void submit();
        }}
      />
    </Screen>
  );
}
