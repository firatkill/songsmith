import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Switch } from 'react-native';
import { creativeKinds, notificationPrefsSchema } from '@songsmith/schemas';
import { useApp } from '../src/state';
import { api } from '../src/api';
import { Screen, Copy, Group, ListRow, Button, ErrorNotice } from '../src/ui';
export default function NotificationSettings() {
  const router = useRouter();
  const { me, locale, t, refresh } = useApp();
  const [prefs, setPrefs] = useState(() =>
    notificationPrefsSchema.parse(me?.settings.notification_prefs ?? {}),
  );
  const [marketing, setMarketing] = useState(
      me?.settings.marketing_email_opt_in ?? false,
    ),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState<'saved' | 'error' | null>(null);
  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const result = await api(locale).PUT('/v1/me/settings', {
        body: { notificationPrefs: prefs, marketingEmailOptIn: marketing },
      });
      if (result.error) throw new Error();
      await refresh();
      setStatus('saved');
    } catch {
      setStatus('error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Button
        title={t('ui.back')}
        onPress={() => {
          router.back();
        }}
      />
      <Copy title>{t('notification.settings')}</Copy>
      <Copy variant="overline">{t('notification.email')}</Copy>
      <Copy>{t('notification.transactional')}</Copy>
      <Group>
        {creativeKinds.map((kind) => (
          <ListRow key={kind} label={t(`notification.email.${kind}`)}>
            <Switch
              accessibilityLabel={t(`notification.email.${kind}`)}
              disabled={busy}
              value={prefs.email[kind]}
              onValueChange={(value) => {
                setStatus(null);
                setPrefs({
                  ...prefs,
                  email: { ...prefs.email, [kind]: value },
                });
              }}
            />
          </ListRow>
        ))}
      </Group>
      <Copy variant="overline">{t('notification.push')}</Copy>
      <Copy>{t('notification.pushNote')}</Copy>
      <Group>
        {creativeKinds.map((kind) => (
          <ListRow key={kind} label={t(`notification.kind.${kind}`)}>
            <Switch
              accessibilityLabel={t(`notification.kind.${kind}`)}
              disabled={busy}
              value={prefs.push[kind]}
              onValueChange={(value) => {
                setStatus(null);
                setPrefs({ ...prefs, push: { ...prefs.push, [kind]: value } });
              }}
            />
          </ListRow>
        ))}
      </Group>
      <Group>
        <ListRow label={t('notification.marketing')}>
          <Switch
            accessibilityLabel={t('notification.marketing')}
            disabled={busy}
            value={marketing}
            onValueChange={(value) => {
              setStatus(null);
              setMarketing(value);
            }}
          />
        </ListRow>
      </Group>
      <Button
        title={t('notification.save')}
        disabled={busy}
        onPress={() => void save()}
      />
      {status === 'saved' && <Copy>{t('notification.saved')}</Copy>}
      <ErrorNotice
        message={status === 'error' ? t('notification.error') : ''}
      />
    </Screen>
  );
}
