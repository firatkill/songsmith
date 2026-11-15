import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { useApp } from '../../src/state';
import { useTheme } from '../../src/theme';
const destinations = [
  {
    name: 'create',
    label: 'web.create',
    icon: 'add-circle',
    outline: 'add-circle-outline',
  },
  {
    name: 'library',
    label: 'web.library',
    icon: 'musical-notes',
    outline: 'musical-notes-outline',
  },
  {
    name: 'explore',
    label: 'web.explore',
    icon: 'compass',
    outline: 'compass-outline',
  },
  {
    name: 'profile',
    label: 'mobile.profile',
    icon: 'person',
    outline: 'person-outline',
  },
] as const;
export default function Layout() {
  const { t } = useApp();
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 11,
          lineHeight: 14,
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.hairline,
        },
      }}
    >
      {destinations.map(({ name, label, icon, outline }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: t(label),
            tabBarIcon: ({ focused, size }) => (
              <View
                style={{
                  width: 56,
                  height: 28,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: focused
                    ? colors.surfaceAccent
                    : colors.surface,
                }}
              >
                <Ionicons
                  name={focused ? icon : outline}
                  color={focused ? colors.ink : colors.muted}
                  size={size}
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
