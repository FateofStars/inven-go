import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, press, radius, space, type, weight } from '@/theme';

type UndoButtonProps = {
  onPress: () => void;
  /**
   * 深色浮层（toast）上用浅色描边与文字；浅色卡片上用主题绿的浅底深字，不描边。
   * 与「置顶」按钮同构：图标 + 文字包在同一个圆角矩形里，点哪里都能触发。
   */
  tone?: 'light' | 'dark';
};

export function UndoButton({ onPress, tone = 'light' }: UndoButtonProps) {
  const dark = tone === 'dark';
  // 图标比文字降一档：图标覆盖面积更大，同色会让按钮内部读成同一个重量。
  const iconColor = dark ? colors.onInkMuted : colors.teal;
  const labelColor = dark ? colors.onInk : colors.tealStrong;
  return (
    <Pressable
      style={({ pressed }) => [styles.button, dark ? styles.onDark : styles.onLight, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="撤销本次操作"
      hitSlop={space.sm}
    >
      <MaterialCommunityIcons name="undo" size={14} color={iconColor} />
      <Text maxFontSizeMultiplier={1.2} style={[styles.label, { color: labelColor }]}>
        撤销
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    // 高度与商品详情页的「置顶」按钮一致，两个入口的撤销按钮观感统一。
    minHeight: type.display.lineHeight,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  /** 浅色面：沿用主题绿的软底，只去掉描边，靠底色表达按钮形状。 */
  onLight: {
    backgroundColor: colors.tealSoft,
  },
  /** 深色面：toast 底色本身较深，保留浅色描边保证边界清晰。 */
  onDark: {
    borderWidth: 1,
    borderColor: colors.onInkMuted,
  },
  pressed: {
    opacity: press.opacity,
  },
  label: {
    ...type.caption,
    fontWeight: weight.bold,
  },
});
