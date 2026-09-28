import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, shadow } from '@/theme';

export type ToastTone = 'success' | 'warning' | 'info';

/**
 * 副标题（actionHint）使用的暖黄色。
 * 导出出来给「同一底色、不同字色」的场景复用，避免各处硬编码色值。
 */
export const TOAST_HINT_COLOR = '#F3D7B5';

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
  success: { background: '#173F2E', label: colors.white },
  warning: { background: '#6E3B16', label: '#FFF4E8' },
  info: { background: '#1C2E52', label: colors.white },
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
        <Text style={[styles.message, { color: messageColor ?? palette.label }]}>{message}</Text>
        {actionHint ? <Text style={styles.hint}>{actionHint}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...shadow,
  },
  copy: {
    gap: 4,
  },
  pressed: {
    opacity: 0.8,
  },
  message: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  hint: {
    color: TOAST_HINT_COLOR,
    fontSize: 13,
  },
});
