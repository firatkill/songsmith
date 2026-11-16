import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Locale } from '@songsmith/i18n';
import { api } from './api';
const tokenKey = 'songsmith.pushToken';
export function pushProjectId(): string | undefined {
  return Constants.easConfig?.projectId;
}
export async function registerPush(locale: Locale, requestPermission = false) {
  if (!pushProjectId() || (Platform.OS !== 'ios' && Platform.OS !== 'android'))
    return;
  try {
    const notifications = await import('expo-notifications');
    if (Platform.OS === 'android')
      await notifications.setNotificationChannelAsync('default', {
        name: 'Songsmith',
        importance: notifications.AndroidImportance.DEFAULT,
      });
    let permission = await notifications.getPermissionsAsync();
    if (requestPermission && !permission.granted && permission.canAskAgain)
      permission = await notifications.requestPermissionsAsync();
    if (!permission.granted) return;
    const projectId = pushProjectId();
    if (!projectId) return;
    const token = (await notifications.getExpoPushTokenAsync({ projectId }))
      .data;
    const result = await api(locale).POST('/v1/me/devices', {
      body: { platform: Platform.OS, expoPushToken: token },
    });
    if (!result.error) await SecureStore.setItemAsync(tokenKey, token);
  } catch {
    /* Unconfigured emulators, missing FCM and denied permission are expected. */
  }
}
export async function unregisterPush(locale: Locale) {
  const token = await SecureStore.getItemAsync(tokenKey);
  if (!token) return;
  const result = await api(locale).DELETE('/v1/me/devices/{token}', {
    params: { path: { token } },
  });
  if (result.error) throw new Error('Device removal failed');
  await SecureStore.deleteItemAsync(tokenKey);
}
