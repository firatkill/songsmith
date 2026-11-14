import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from './state';
import { useTheme } from './theme';
export function Copy({
  children,
  title = false,
  testID,
}: {
  children: ReactNode;
  title?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Text
      testID={testID}
      accessibilityRole={title ? 'header' : 'text'}
      style={{
        color: theme.colors.text,
        fontFamily: title
          ? 'BricolageGrotesque_800ExtraBold'
          : 'Inter_400Regular',
        fontSize: title ? theme.typeScale.heading : theme.typeScale.body,
        lineHeight: title ? 30 : 26,
      }}
    >
      {children}
    </Text>
  );
}
export function Screen({ children }: { children: ReactNode }) {
  const { t } = useApp();
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
            flexGrow: 1,
          }}
        >
          <View
            style={{
              padding: theme.spacing.md,
              backgroundColor: theme.colors.surfaceAccent,
              borderRadius: theme.radii.card,
              borderColor: theme.colors.borderOnSurfaceAccent,
              borderWidth: theme.borderWidth.default,
            }}
          >
            <Text
              style={{
                color: theme.colors.onSurfaceAccent,
                fontFamily: 'BricolageGrotesque_800ExtraBold',
                fontSize: 24,
              }}
            >
              {t('web.brand')}
            </Text>
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        padding: 12,
        borderRadius: theme.radii.control,
        borderWidth: theme.borderWidth.default,
        borderColor: theme.colors.border,
        backgroundColor: disabled
          ? theme.colors.disabled
          : theme.colors.primary,
        opacity: !disabled && pressed ? 0.8 : 1,
      })}
    >
      <Text
        style={{
          color: disabled ? theme.colors.onDisabled : theme.colors.onPrimary,
          fontFamily: 'Inter_500Medium',
          fontSize: 16,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Copy>{label}</Copy>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.muted}
        style={{
          minHeight: 48,
          borderWidth: theme.borderWidth.default,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.control,
          padding: 12,
          color: theme.colors.text,
          backgroundColor: theme.colors.surface,
          fontFamily: 'Inter_400Regular',
          fontSize: 16,
        }}
      />
    </View>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  const theme = useTheme();
  return message ? (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        color: theme.colors.danger,
        backgroundColor: theme.colors.dangerSurface,
        padding: 12,
      }}
    >
      {message}
    </Text>
  ) : null;
}

export function RadioChoice({
  title,
  selected,
  busy,
  onPress,
}: {
  title: string;
  selected: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      onPress={() => {
        if (!selected && !busy) onPress();
      }}
      style={{
        minHeight: 48,
        padding: 12,
        borderRadius: theme.radii.control,
        borderWidth: theme.borderWidth.default,
        borderColor: theme.colors.border,
        backgroundColor: selected
          ? theme.colors.surfaceAccent
          : theme.colors.surface,
      }}
    >
      <Text
        style={{
          color: selected ? theme.colors.onSurfaceAccent : theme.colors.text,
          fontFamily: selected ? 'Inter_500Medium' : 'Inter_400Regular',
          fontSize: 16,
        }}
      >
        {selected ? '● ' : '○ '}
        {title}
      </Text>
    </Pressable>
  );
}
