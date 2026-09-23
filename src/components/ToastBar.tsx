import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, shadow } from '@/theme';

export type ToastTone = 'success' | 'warning' | 'info';

type ToastBarProps = {
  message: string;
  tone: ToastTone;
  actionHint?: string;
  onPress?: () => void;
  bottom: number;
};

const toneStyle = {
  success: { background: '#173F2E', label: colors.white },
  warning: { background: '#6E3B16', label: '#FFF4E8' },
  info: { background: '#1C2E52', label: colors.white },
} as const;

export function ToastBar({ message, tone, actionHint, onPress, bottom }: ToastBarProps) {
  const palette = toneStyle[tone];
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      onPress={onPress}
      style={[styles.bar, { backgroundColor: palette.background, bottom }]}
    >
      <View style={styles.copy}>
        <Text style={[styles.message, { color: palette.label }]}>{message}</Text>
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
  message: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  hint: {
    color: '#F3D7B5',
    fontSize: 13,
  },
});
