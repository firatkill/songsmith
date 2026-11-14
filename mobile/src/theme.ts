import { useColorScheme } from 'react-native';
import { nativeThemes } from '@songsmith/ui-tokens';
export function useTheme() {
  return nativeThemes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
