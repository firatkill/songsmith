import { View } from 'react-native';
import { useState } from 'react';
import { useApp } from '../../src/state';
import { Screen, Copy, Button, ErrorNotice, RadioChoice } from '../../src/ui';
export default function Profile() {
  const { t, me, locale, setLocale, signOut } = useApp();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch {
      setError(t('errors.INTERNAL'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Copy title>{t('mobile.profile')}</Copy>
      <Copy>{t('web.welcome', { handle: me?.profile.handle ?? '' })}</Copy>
      <Copy title>{t('web.settings')}</Copy>
      <Copy>{t('web.language')}</Copy>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('web.language')}
        style={{ gap: 8 }}
      >
        {(['en', 'tr'] as const).map((value) => (
          <RadioChoice
            key={value}
            selected={locale === value}
            busy={busy}
            title={t(`web.${value}`)}
            onPress={() => {
              void run(() => setLocale(value));
            }}
          />
        ))}
      </View>
      <ErrorNotice message={error} />
      <Button
        disabled={busy}
        title={t('web.signOut')}
        onPress={() => {
          void run(signOut);
        }}
      />
    </Screen>
  );
}
