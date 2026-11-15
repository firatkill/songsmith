import { View } from 'react-native';
import { useState } from 'react';
import { useApp } from '../../src/state';
import {
  Screen,
  Copy,
  ErrorNotice,
  Avatar,
  Group,
  ListRow,
  SegmentedControl,
} from '../../src/ui';
export default function Profile() {
  const {
    t,
    me,
    locale,
    setLocale,
    signOut,
    email,
    appearance,
    setAppearance,
  } = useApp();
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
      <Group featured>
        <View
          style={{
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <Avatar handle={me?.profile.handle ?? ''} />
          <View style={{ flex: 1, gap: 4 }}>
            <Copy variant="label">@{me?.profile.handle}</Copy>
            <Copy variant="caption">{email}</Copy>
          </View>
        </View>
      </Group>
      <Copy variant="overline">{t('ui.settings')}</Copy>
      <Group>
        <ListRow label={t('web.language')}>
          <SegmentedControl
            label={t('web.language')}
            value={locale}
            options={(['en', 'tr'] as const).map((value) => ({
              value,
              label: t(`ui.${value}`),
            }))}
            onChange={(value) => {
              if (!busy) void run(() => setLocale(value));
            }}
          />
        </ListRow>
        <ListRow label={t('ui.appearance')}>
          <SegmentedControl
            label={t('ui.appearance')}
            value={appearance}
            options={(['system', 'light', 'dark'] as const).map((value) => ({
              value,
              label: t(`ui.${value}`),
            }))}
            onChange={(value) => {
              if (!busy) void run(() => setAppearance(value));
            }}
          />
        </ListRow>
      </Group>
      <Group>
        <ListRow
          danger
          label={t('web.signOut')}
          onPress={() => {
            if (!busy) void run(signOut);
          }}
        />
      </Group>
      <ErrorNotice message={error} />
    </Screen>
  );
}
