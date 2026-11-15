import '../src/zod-config';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { gatePresentation } from '../src/auth/gate';
import { useTheme } from '../src/theme';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Provider, useApp } from '../src/state';
import { Screen, Copy, Button, ErrorNotice } from '../src/ui';
function Gate() {
  const { stage, initialized, loading, error, refresh, t, appearanceReady } =
    useApp();
  const [fonts, fontError] = useFonts({
    BricolageGrotesque_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const presentation = gatePresentation(initialized, loading, error);
  const theme = useTheme();
  if (presentation === 'initial-error')
    return (
      <Screen>
        <Copy title>{t('web.errorTitle')}</Copy>
        <Button
          title={t('web.retry')}
          onPress={() => {
            void refresh();
          }}
        />
      </Screen>
    );
  if (
    !appearanceReady ||
    presentation === 'initial-loading' ||
    (!fonts && !fontError)
  )
    return (
      <Screen>
        <Copy>{t('web.busy')}</Copy>
      </Screen>
    );
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={stage === 'ready'}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={stage !== 'ready'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      {presentation === 'background-error' && (
        <SafeAreaView edges={['bottom']} style={{ padding: theme.spacing.md }}>
          <ErrorNotice message={t('web.errorTitle')} />
          <Button
            disabled={loading}
            title={t('web.retry')}
            onPress={() => {
              void refresh();
            }}
          />
        </SafeAreaView>
      )}
    </View>
  );
}
export default function Layout() {
  return (
    <SafeAreaProvider>
      <Provider>
        <Gate />
      </Provider>
    </SafeAreaProvider>
  );
}
