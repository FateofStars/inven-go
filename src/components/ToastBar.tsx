import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, elevation, press, radius, space, textScale, type, weight } from '@/theme';

export type ToastTone = 'success' | 'warning' | 'info';

type ToastBarProps = {
  message: string;
  tone: ToastTone;
  /** 覆盖主文案字色；不传则跟随该 tone 的默认字色。 */
  messageColor?: string;
  actionHint?: string;
  onPress?: () => void;
  bottom: number;
};

const toneStyle = {
  success: { background: colors.toastSuccessBg, label: colors.white },
  warning: { background: colors.toastWarningBg, label: colors.toastWarningText },
  info: { background: colors.toastInfoBg, label: colors.white },
} as const;

export function ToastBar({ message, tone, messageColor, actionHint, onPress, bottom }: ToastBarProps) {
  const palette = toneStyle[tone];
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bar,
        { backgroundColor: palette.background, bottom },
        // 只有可点击的提示条才给按压反馈，纯提示不该有「按得动」的错觉。
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      <View style={styles.copy}>
        <Text maxFontSizeMultiplier={textScale.body} style={[styles.message, { color: messageColor ?? palette.label }]}>{message}</Text>
        {actionHint ? <Text maxFontSizeMultiplier={textScale.body} style={styles.hint}>{actionHint}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    ...elevation.float,
  },
  copy: {
    gap: space.xs,
  },
  pressed: {
    opacity: press.opacity,
  },
  message: {
    ...type.bodyLg,
    fontWeight: weight.bold,
  },
  hint: {
    color: colors.toastHint,
    ...type.caption,
    fontWeight: weight.regular,
  },
});
