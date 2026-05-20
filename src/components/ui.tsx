/**
 * Shared visual primitives — RN translations of `sseemo/project/shared.jsx`
 * (Card, CardRow, Button, Chip, IconButton, FAB, SectionLabel, NavBar, Field,
 * UsageBar, Progress, SubNav). Keeps screens declarative.
 */
import React, { ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  PressableProps,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
  TextInputProps,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
  type Edge,
} from 'react-native-safe-area-context';
import { useTheme, radii, spacing, type, shadows, Palette } from '@/theme';
import { AppIcon } from '@/components/icons';

// ─── Card ────────────────────────────────────────────────────────────────
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radii['2xl'],
          overflow: 'hidden',
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function CardRow({
  children,
  onPress,
  last,
  style,
  testID,
}: {
  children: ReactNode;
  onPress?: () => void;
  last?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.lg,
          paddingVertical: 12,
          paddingHorizontal: spacing.xl,
          borderBottomColor: t.border,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          backgroundColor: pressed ? t.surface2 : 'transparent',
        },
        style,
      ]}>
      {children}
    </Pressable>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  small,
  testID,
  style,
  leading,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  small?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  leading?: ReactNode;
}) {
  const t = useTheme();
  const { bg, color, border } = btnColors(t, variant);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          height: small ? 36 : 50,
          paddingHorizontal: small ? 14 : 18,
          borderRadius: small ? radii.md : radii.xl,
          backgroundColor: bg,
          borderColor: border,
          borderWidth: border ? StyleSheet.hairlineWidth : 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        style,
      ]}>
      {leading}
      <Text
        style={{
          color,
          fontSize: small ? 13 : 15,
          fontWeight: '600',
        }}>
        {title}
      </Text>
    </Pressable>
  );
}

function btnColors(t: Palette, v: Variant) {
  switch (v) {
    case 'primary':
      return { bg: t.text, color: t.textInverse, border: '' };
    case 'secondary':
      return { bg: t.surface, color: t.text, border: t.borderStrong };
    case 'ghost':
      return { bg: 'transparent', color: t.text, border: '' };
    case 'accent':
      return { bg: t.accent, color: '#FFFFFF', border: '' };
    case 'danger':
      return { bg: t.surface, color: t.danger, border: t.borderStrong };
  }
}

// ─── Chip ────────────────────────────────────────────────────────────────
export function Chip({
  label,
  tone = 'default',
}: {
  label: string;
  tone?: 'default' | 'accent' | 'warn';
}) {
  const t = useTheme();
  let bg = t.surface2;
  let color = t.text2;
  let border = t.border;
  if (tone === 'accent') {
    bg = t.accentSoft;
    color = t.accentText;
    border = 'transparent';
  } else if (tone === 'warn') {
    bg = t.warningSoft;
    color = t.warning;
    border = 'transparent';
  }
  return (
    <View
      style={{
        backgroundColor: bg,
        borderColor: border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radii.pill,
        paddingHorizontal: 8,
        height: 22,
        justifyContent: 'center',
      }}>
      <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

// ─── IconButton / FAB ────────────────────────────────────────────────────
export function IconButton({
  onPress,
  children,
  ghost,
  primary,
  size = 36,
  testID,
  style,
}: {
  onPress?: () => void;
  children: ReactNode;
  ghost?: boolean;
  primary?: boolean;
  size?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = primary ? t.text : ghost ? 'transparent' : t.surface;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: radii.lg,
          backgroundColor: bg,
          borderColor: ghost || primary ? 'transparent' : t.border,
          borderWidth: ghost || primary ? 0 : StyleSheet.hairlineWidth,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
        style,
      ]}>
      {children}
    </Pressable>
  );
}

export function FAB({
  onPress,
  children,
  testID,
  bottomOffset = 0,
  rightOffset = 18,
}: {
  onPress?: () => void;
  children: ReactNode;
  testID?: string;
  bottomOffset?: number;
  rightOffset?: number;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        {
          position: 'absolute',
          right: rightOffset,
          bottom: bottomOffset + insets.bottom,
          width: 56,
          height: 56,
          borderRadius: radii['3xl'],
          backgroundColor: t.text,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
        shadows.fab,
      ]}>
      {children}
    </Pressable>
  );
}

// ─── NavBar (large title) ────────────────────────────────────────────────
export function NavBar({
  sub,
  title,
  trailing,
  leading,
  meta,
}: {
  sub?: string;
  title: string;
  trailing?: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
        backgroundColor: t.bg,
      }}>
      <View style={{ flex: 1 }}>
        {leading}
        {sub ? (
          <Text style={[type.navSub, { color: t.text3, marginBottom: 6 }]}>
            {sub}
          </Text>
        ) : null}
        <Text style={[type.navTitle, { color: t.text }]}>{title}</Text>
        {meta}
      </View>
      {trailing ? (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {trailing}
        </View>
      ) : null}
    </View>
  );
}

export function SubNav({
  title,
  onBack,
  trailing,
}: {
  title: string;
  onBack?: () => void;
  trailing?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 14,
        paddingTop: 8,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: t.bg,
      }}>
      {onBack ? (
        <IconButton ghost onPress={onBack}>
          <AppIcon name="chevronLeft" color={t.text} size={22} />
        </IconButton>
      ) : null}
      <Text
        style={{
          flex: 1,
          fontSize: 17,
          fontWeight: '600',
          color: t.text,
          letterSpacing: -0.2,
        }}>
        {title}
      </Text>
      {trailing}
    </View>
  );
}

// ─── SectionLabel ────────────────────────────────────────────────────────
export function SectionLabel({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text
      style={[
        type.sectionLabel,
        { color: t.text3, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
      ]}>
      {children}
    </Text>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────
export function Field({
  label,
  value,
  onChange,
  secure,
  mono,
  testID,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  mono?: boolean;
  testID?: string;
  placeholder?: string;
}) {
  const t = useTheme();
  const props: TextInputProps = {
    value,
    onChangeText: onChange,
    secureTextEntry: secure,
    autoCapitalize: 'none',
    autoCorrect: false,
    placeholder,
    placeholderTextColor: t.text3,
    testID,
  };
  return (
    <View style={{ gap: 6, paddingHorizontal: 4, marginBottom: 12 }}>
      <Text style={[type.sectionLabel, { color: t.text3, padding: 0 }]}>{label}</Text>
      <TextInput
        {...props}
        style={{
          height: 44,
          paddingHorizontal: 14,
          backgroundColor: t.surface,
          borderColor: t.borderStrong,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radii.lg,
          color: t.text,
          fontSize: mono ? 13 : 15,
          fontFamily: mono ? type.mono.fontFamily : undefined,
        }}
      />
    </View>
  );
}

// ─── Progress / UsageBar ─────────────────────────────────────────────────
export function Progress({
  value,
  tone = 'default',
  height = 6,
}: {
  value: number; // 0..1
  tone?: 'default' | 'warn' | 'danger';
  height?: number;
}) {
  const t = useTheme();
  const color =
    tone === 'danger' ? t.danger : tone === 'warn' ? t.warning : t.text;
  return (
    <View
      style={{
        height,
        backgroundColor: t.surface3,
        borderRadius: radii.pill,
        overflow: 'hidden',
      }}>
      <View
        style={{
          width: `${Math.min(100, Math.max(0, value * 100))}%`,
          height: '100%',
          backgroundColor: color,
          borderRadius: radii.pill,
        }}
      />
    </View>
  );
}

export function UsageBar({
  value,
  tone = 'default',
  height = 8,
}: {
  value: number;
  tone?: 'default' | 'warn' | 'danger';
  height?: number;
}) {
  const t = useTheme();
  // Brand gradient → in RN without expo-linear-gradient we approximate via
  // a single brand-1 fill; visually similar at thin heights (~6-8px).
  const color =
    tone === 'danger' ? t.danger : tone === 'warn' ? t.warning : t.brand1;
  return (
    <View
      style={{
        height,
        backgroundColor: t.surface3,
        borderRadius: radii.pill,
        overflow: 'hidden',
      }}>
      <View
        style={{
          width: `${Math.min(100, Math.max(0, value * 100))}%`,
          height: '100%',
          backgroundColor: color,
          borderRadius: radii.pill,
        }}
      />
    </View>
  );
}

// ─── Screen wrapper ──────────────────────────────────────────────────────
export function Screen({
  children,
  testID,
  style,
  edges = ['top', 'left', 'right'],
}: {
  children: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
}) {
  const t = useTheme();
  return (
    <SafeAreaView
      testID={testID}
      edges={edges}
      style={[{ flex: 1, backgroundColor: t.bg }, style]}>
      {children}
    </SafeAreaView>
  );
}

// ─── Wordmark ────────────────────────────────────────────────────────────
export function Wordmark({ size = 28, color }: { size?: number; color?: string }) {
  const t = useTheme();
  return (
    <Text
      style={{
        ...type.brand,
        fontSize: size,
        lineHeight: size * 1.05,
        color: color ?? t.text,
        letterSpacing: -size * 0.03,
      }}>
      sseemo
    </Text>
  );
}

// ─── Brand mark (lock-in-cloud, RN-approximation) ────────────────────────
// The design's SseemoMark is an SVG. Without react-native-svg the closest
// faithful approximation is a styled circle gradient stand-in. We keep this
// minimal — a softly colored rounded square with a lock glyph.
export function BrandMark({ size = 64 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: '#9586F2',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#6A6BF0',
        shadowOpacity: 0.35,
        shadowRadius: size * 0.18,
        shadowOffset: { width: 0, height: size * 0.08 },
      }}>
      <AppIcon name="lock" size={size * 0.48} color="#fff" strokeWidth={2.4} />
    </View>
  );
}

// Convenience text helpers
export function NumText({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[type.num, style]}>{children}</Text>;
}
