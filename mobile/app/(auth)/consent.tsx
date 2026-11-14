import { useState } from 'react';
import { Platform, Switch, View } from 'react-native';
import { consentVersions, type ConsentKind } from '../../src/validation';
import { useApp } from '../../src/state';
import { api } from '../../src/api';
import { errorCode, errorMessage } from '../../src/errors';
import { Screen, Copy, Button, ErrorNotice } from '../../src/ui';
const kinds: ConsentKind[] = [
  'terms',
  'privacy',
  'ai_disclosure',
  'marketing',
  'analytics',
];
export default function Consent() {
  const { t, locale, refresh } = useApp();
  const [selected, setSelected] = useState<Record<ConsentKind, boolean>>({
    terms: false,
    privacy: false,
    ai_disclosure: false,
    marketing: false,
    analytics: false,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setError('');
    try {
      for (const kind of kinds) {
        const result = await api(locale).POST('/v1/me/consents', {
          body: {
            kind,
            version: consentVersions[kind],
            granted: selected[kind],
            source: Platform.OS === 'ios' ? 'ios' : 'android',
          },
        });
        if (result.error) {
          if (
            ['UNAUTHENTICATED', 'NOT_ADULT'].includes(errorCode(result.error))
          )
            await refresh();
          else setError(errorMessage(locale, result.error));
          return;
        }
      }
      await refresh();
    } catch {
      setError(t('errors.INTERNAL'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Copy title>{t('web.consentTitle')}</Copy>
      <Copy>{t('web.provisional')}</Copy>
      <Copy>{t('web.disclosure')}</Copy>
      {kinds.map((kind, index) => (
        <View key={kind} style={{ gap: 8 }}>
          {index === 0 && <Copy title>{t('web.requiredConsents')}</Copy>}
          {index === 3 && (
            <>
              <Copy title>{t('web.optionalConsents')}</Copy>
              <Copy>{t('web.optionalHelp')}</Copy>
            </>
          )}
          <Copy>{t(`web.${kind}`)}</Copy>
          <Switch
            testID={`consent-${kind}`}
            accessibilityLabel={t(`web.${kind}`)}
            disabled={busy}
            value={selected[kind]}
            onValueChange={(value) => {
              setSelected({ ...selected, [kind]: value });
            }}
          />
        </View>
      ))}
      <ErrorNotice message={error} />
      <Button
        testID="submit-consent"
        disabled={
          busy ||
          !selected.terms ||
          !selected.privacy ||
          !selected.ai_disclosure
        }
        title={t(busy ? 'web.busy' : 'web.continue')}
        onPress={() => {
          void submit();
        }}
      />
    </Screen>
  );
}
