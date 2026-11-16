import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useApp } from './state';
import { Copy, Button } from './ui';
import { pushProjectId, registerPush } from './push';
export function PushRegistration() {
  const { locale, t, me } = useApp(),
    router = useRouter();
  const [explain, setExplain] = useState(false);
  useEffect(() => {
    if (!me || !pushProjectId()) return;
    let stopped = false,
      remove: (() => void) | undefined;
    const key = `songsmith.pushAsked.${me.profile.id}`;
    void SecureStore.getItemAsync(key)
      .then(async (asked) => {
        if (stopped) return;
        if (asked) await registerPush(locale);
        else setExplain(true);
      })
      .catch(() => undefined);
    void import('expo-notifications')
      .then((n) => {
        if (stopped) return;
        const open = (data: Record<string, unknown> | undefined) => {
          if (typeof data?.['jobId'] === 'string')
            router.push('/(tabs)/create');
        };
        const subscription = n.addNotificationResponseReceivedListener((r) => {
          open(r.notification.request.content.data);
        });
        remove = () => {
          subscription.remove();
        };
        const last = n.getLastNotificationResponse();
        if (last) {
          open(last.notification.request.content.data);
          n.clearLastNotificationResponse();
        }
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
      remove?.();
    };
  }, [me?.profile.id, locale, router]);
  async function answer(allow: boolean) {
    if (!me) return;
    setExplain(false);
    await SecureStore.setItemAsync(`songsmith.pushAsked.${me.profile.id}`, '1');
    if (allow) await registerPush(locale, true);
  }
  if (!explain) return null;
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Copy>{t('notification.permission')}</Copy>
      <Button
        title={t('notification.enable')}
        onPress={() => void answer(true)}
      />
      <Button
        title={t('notification.later')}
        onPress={() => void answer(false)}
      />
    </View>
  );
}
