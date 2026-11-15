import {
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
  type ComponentRef,
} from 'react';
import {
  ActivityIndicator,
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApp } from '../state';
import { useTheme } from '../theme';
import {
  applyDateInput,
  birthDateOrder,
  type BirthDatePart,
} from '../birth-date';
import { codeDigits } from './logic';
export function Copy({
  children,
  title = false,
  variant = 'body',
  centered = false,
  testID,
}: {
  children: ReactNode;
  title?: boolean;
  centered?: boolean;
  variant?: 'body' | 'section' | 'label' | 'caption' | 'overline';
  testID?: string;
}) {
  const { colors } = useTheme();
  const heading = title || variant === 'section';
  const sizes = title
    ? [32, 36]
    : variant === 'section'
      ? [20, 24]
      : variant === 'label'
        ? [14, 20]
        : variant === 'caption'
          ? [13, 18]
          : variant === 'overline'
            ? [12, 16]
            : [16, 24];
  return (
    <Text
      testID={testID}
      accessibilityRole={heading ? 'header' : 'text'}
      style={{
        color:
          variant === 'caption' || variant === 'overline'
            ? colors.muted
            : colors.text,
        fontFamily: heading
          ? 'BricolageGrotesque_800ExtraBold'
          : variant === 'label' || variant === 'overline'
            ? 'Inter_600SemiBold'
            : 'Inter_400Regular',
        fontSize: sizes[0],
        lineHeight: sizes[1],
        textAlign: centered ? 'center' : 'left',
        letterSpacing: title ? -0.6 : variant === 'overline' ? 1 : 0,
      }}
    >
      {children}
    </Text>
  );
}
export function Screen({
  children,
  footer,
  onBack,
  brand = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  onBack?: (() => void) | undefined;
  brand?: boolean;
}) {
  const theme = useTheme();
  const { t } = useApp();
  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={{ flex: 1, backgroundColor: theme.colors.canvas }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: theme.spacing.screen,
            gap: 24,
            flexGrow: 1,
          }}
        >
          {onBack && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('ui.back')}
              onPress={onBack}
              style={{
                minWidth: 44,
                minHeight: 44,
                alignSelf: 'flex-start',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="arrow-back" color={theme.colors.text} size={24} />
            </Pressable>
          )}
          {brand && (
            <View
              style={{
                alignSelf: 'flex-start',
                borderRadius: theme.radii.pill,
                borderWidth: 2,
                borderColor: theme.colors.ink,
                backgroundColor: theme.colors.surfaceAccent,
                paddingHorizontal: 12,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{
                  color: theme.colors.ink,
                  fontFamily: 'BricolageGrotesque_800ExtraBold',
                  fontSize: 14,
                }}
              >
                {t('web.brand')}
              </Text>
            </View>
          )}
          {children}
        </ScrollView>
        {footer && (
          <View
            style={{
              backgroundColor: theme.colors.canvas,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 16,
              gap: 8,
            }}
          >
            {footer}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function PrimaryButton({
  title,
  onPress,
  busy = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  testID?: string;
}) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ busy }}
      onPress={() => {
        if (!busy) onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 52,
        padding: 12,
        borderRadius: radii.button,
        borderWidth: 2,
        borderColor: colors.ink,
        backgroundColor: colors.surfaceAccent,
        transform: [
          { translateX: pressed ? 2 : 0 },
          { translateY: pressed ? 2 : 0 },
        ],
        boxShadow: `${pressed ? '1' : '3'}px ${pressed ? '1' : '3'}px 0 ${colors.shadow}`,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Text
        style={{
          fontFamily: 'Inter_600SemiBold',
          fontSize: 16,
          lineHeight: 24,
          color: colors.ink,
          opacity: busy ? 0 : 1,
        }}
      >
        {title}
      </Text>
      {busy && (
        <ActivityIndicator
          color={colors.ink}
          style={{ position: 'absolute' }}
        />
      )}
    </Pressable>
  );
}
// Root loading/error screens retain the old import name; busy never disables validation.
export function Button({
  disabled,
  ...props
}: ComponentProps<typeof PrimaryButton> & { disabled?: boolean }) {
  return <PrimaryButton {...props} busy={props.busy ?? disabled ?? false} />;
}
export function LinkButton({
  title,
  onPress,
  expanded,
}: {
  title: string;
  onPress: () => void;
  expanded?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? {} : { expanded }}
      onPress={onPress}
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'center',
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontFamily: 'Inter_600SemiBold',
          fontSize: 15,
          lineHeight: 20,
          textDecorationLine: 'underline',
        }}
      >
        {title}
      </Text>
      {expanded !== undefined && (
        <Ionicons
          name="chevron-down"
          size={18}
          color={colors.text}
          accessible={false}
          style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
        />
      )}
    </Pressable>
  );
}
export function Field({
  label,
  error,
  inputRef,
  ...props
}: TextInputProps & {
  label: string;
  error?: string | undefined;
  inputRef?: React.Ref<ComponentRef<typeof TextInput>>;
}) {
  const { colors, radii } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Copy variant="label">{label}</Copy>
      <TextInput
        {...props}
        ref={inputRef}
        accessibilityLabel={label}
        onFocus={() => {
          setFocus(true);
        }}
        onBlur={() => {
          setFocus(false);
        }}
        placeholderTextColor={colors.muted}
        style={{
          minHeight: 52,
          borderWidth: 2,
          borderColor: error
            ? colors.danger
            : focus
              ? colors.text
              : colors.fieldBorder,
          borderRadius: radii.field,
          padding: 12,
          color: colors.text,
          backgroundColor: colors.surface,
          fontFamily: 'Inter_400Regular',
          fontSize: 16,
          boxShadow: focus ? `0 0 0 3px ${colors.surfaceAccent}` : undefined,
        }}
      />
      {error && <ErrorNotice message={error} />}
    </View>
  );
}
export const TextField = Field;
export function ErrorNotice({ message }: { message: string }) {
  const { colors } = useTheme();
  return message ? (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        color: colors.danger,
        fontFamily: 'Inter_400Regular',
        fontSize: 13,
        lineHeight: 18,
      }}
    >
      {message}
    </Text>
  ) : null;
}
export function CodeInput({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error: string;
}) {
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const { t } = useApp();
  const { colors, radii } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Copy variant="label">{t('web.code')}</Copy>
      <View style={{ position: 'relative' }}>
        <Pressable
          accessible={false}
          onPress={() => ref.current?.focus()}
          style={{ flexDirection: 'row', gap: 8 }}
        >
          {Array.from({ length: 6 }, (_, index) => (
            <View
              key={index}
              style={{
                flex: 1,
                minWidth: 44,
                minHeight: 52,
                paddingVertical: 12,
                borderRadius: radii.field,
                borderWidth: 2,
                borderColor: error
                  ? colors.danger
                  : focused && index === Math.min(value.length, 5)
                    ? colors.text
                    : colors.fieldBorder,
                boxShadow:
                  focused && index === Math.min(value.length, 5)
                    ? `0 0 0 3px ${colors.surfaceAccent}`
                    : undefined,
                backgroundColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                accessible={false}
                style={{
                  fontFamily: 'Inter_600SemiBold',
                  fontSize: 20,
                  color: colors.text,
                }}
              >
                {value[index] ?? ' '}
              </Text>
            </View>
          ))}
        </Pressable>
        <TextInput
          ref={ref}
          testID="otp-code"
          accessibilityLabel={t('web.code')}
          value={value}
          onChangeText={(text) => {
            onChange(codeDigits(text));
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
          caretHidden
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            opacity: 0.02,
            color: colors.surface,
            fontSize: 1,
          }}
        />
      </View>
      <ErrorNotice message={error} />
    </View>
  );
}
export function DateFields({
  parts,
  onChange,
}: {
  parts: Record<BirthDatePart, string>;
  onChange: (parts: Record<BirthDatePart, string>) => void;
}) {
  const { t, locale } = useApp();
  const refs = useRef<
    Partial<Record<BirthDatePart, ComponentRef<typeof TextInput> | null>>
  >({});
  const latestParts = useRef(parts);
  latestParts.current = parts;
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {birthDateOrder(locale).map((part) => (
        <View key={part} style={{ flex: part === 'year' ? 1.5 : 1 }}>
          <Field
            label={t(`web.${part}`)}
            placeholder={t(`ui.${part}Placeholder`)}
            testID={`birth-${part}`}
            inputRef={(input) => {
              refs.current[part] = input;
            }}
            keyboardType="number-pad"
            selectTextOnFocus
            value={parts[part]}
            onChangeText={(raw) => {
              const result = applyDateInput(
                locale,
                part,
                raw,
                latestParts.current,
              );
              latestParts.current = result.parts;
              onChange(result.parts);
              if (result.focus !== part) refs.current[result.focus]?.focus();
            }}
          />
        </View>
      ))}
    </View>
  );
}
export function Group({
  children,
  required = false,
  featured = false,
}: {
  children: ReactNode;
  required?: boolean;
  featured?: boolean;
}) {
  const { colors, radii } = useTheme();
  return (
    <View
      style={{
        borderRadius: radii.card,
        borderWidth: 2,
        borderColor: required || featured ? colors.text : colors.fieldBorder,
        backgroundColor: colors.surface,
        overflow: featured ? 'visible' : 'hidden',
        boxShadow: featured ? `3px 3px 0 ${colors.shadow}` : undefined,
      }}
    >
      {children}
    </View>
  );
}
export function ToggleRow({
  label,
  caption,
  value,
  onChange,
  testID,
  invalid,
}: {
  label: string;
  caption?: string;
  value: boolean;
  onChange: () => void;
  testID: string;
  invalid: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={onChange}
      style={{
        flexDirection: 'row',
        gap: 16,
        padding: 16,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: colors.hairline,
        borderLeftWidth: 3,
        borderLeftColor: invalid ? colors.danger : colors.surface,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Copy variant="label">{label}</Copy>
        {caption && <Copy variant="caption">{caption}</Copy>}
      </View>
      <View
        accessible={false}
        style={{
          width: 48,
          height: 28,
          borderRadius: 999,
          padding: 3,
          backgroundColor: value ? colors.ink : colors.fieldBorder,
          alignItems: value ? 'flex-end' : 'flex-start',
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            backgroundColor: value
              ? colors.surfaceAccent
              : colors.surfaceOnAccent,
          }}
        />
      </View>
    </Pressable>
  );
}
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        borderRadius: 999,
        borderWidth: 2,
        borderColor: colors.text,
        padding: 3,
        gap: 4,
      }}
    >
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="radio"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: value === option.value }}
          onPress={() => {
            if (value !== option.value) onChange(option.value);
          }}
          style={{
            flexGrow: 1,
            minHeight: 44,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            justifyContent: 'center',
            backgroundColor:
              value === option.value ? colors.selectedSegment : colors.surface,
          }}
        >
          <Text
            style={{
              textAlign: 'center',
              fontFamily: 'Inter_600SemiBold',
              fontSize: 14,
              lineHeight: 20,
              color:
                value === option.value ? colors.onSelectedSegment : colors.text,
            }}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function ListRow({
  label,
  value,
  onPress,
  danger = false,
  children,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text
          style={{
            flex: 1,
            fontFamily: 'Inter_600SemiBold',
            fontSize: 14,
            lineHeight: 20,
            color: danger ? colors.danger : colors.text,
          }}
        >
          {label}
        </Text>
        {value && <Copy variant="caption">{value}</Copy>}
        {onPress && (
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        )}
      </View>
      {children}
    </>
  );
  const style = {
    padding: 16,
    gap: 12,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  };
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={style}>
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignSelf: 'center',
        borderRadius: 999,
        paddingVertical: 4,
        paddingHorizontal: 12,
        backgroundColor: colors.accentSoft,
      }}
    >
      <Text
        style={{
          color: colors.onAccentSoft,
          fontFamily: 'Inter_400Regular',
          fontSize: 13,
          lineHeight: 18,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
export function Avatar({ handle }: { handle: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 52,
        minHeight: 52,
        borderRadius: 999,
        borderWidth: 2,
        borderColor: colors.ink,
        backgroundColor: colors.pink,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: 'BricolageGrotesque_800ExtraBold',
          fontSize: 24,
          color: colors.onPink,
        }}
      >
        {handle.slice(0, 1).toLocaleUpperCase()}
      </Text>
    </View>
  );
}
export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
}) {
  const { colors } = useTheme();
  const { t } = useApp();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        paddingVertical: 32,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 999,
          borderWidth: 2,
          borderColor: colors.ink,
          backgroundColor: colors.surfaceAccent,
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `3px 3px 0 ${colors.shadow}`,
        }}
      >
        <Ionicons name={icon} size={28} color={colors.ink} accessible={false} />
      </View>
      <Copy variant="section" centered>
        {title}
      </Copy>
      <Copy variant="caption" centered>
        {body}
      </Copy>
      <Badge>{t('web.comingSoon')}</Badge>
    </View>
  );
}
