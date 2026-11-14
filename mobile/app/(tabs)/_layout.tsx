import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useApp } from '../../src/state';
import { useTheme } from '../../src/theme';
export default function Layout() {
  const { t } = useApp();
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="create"
        options={{
          title: t('web.create'),
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="add-circle-outline"
              color={focused ? theme.colors.accent : theme.colors.muted}
              size={size}
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('web.library'),
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="musical-notes-outline"
              color={focused ? theme.colors.accent : theme.colors.muted}
              size={size}
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: t('web.explore'),
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="compass-outline"
              color={focused ? theme.colors.accent : theme.colors.muted}
              size={size}
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('mobile.profile'),
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="person-outline"
              color={focused ? theme.colors.accent : theme.colors.muted}
              size={size}
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ),
        }}
      />
    </Tabs>
  );
}
