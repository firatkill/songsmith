import { useColorScheme } from 'react-native';
import { nativeThemes, resolveAppearance } from '@songsmith/ui-tokens';
import { useApp } from './state';
export function useTheme() {
  const { appearance } = useApp();
  const mode = resolveAppearance(appearance, useColorScheme());
  return { ...nativeThemes[mode], mode };
}
