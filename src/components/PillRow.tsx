import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { colors, elevation, radius, size, space, textScale, type, weight } from '@/theme';

type PillRowProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  /** 图标主色，取语义色的 `base` 档。 */
  color: string;
  /** 标题字色，取同一色相的 `strong` 档以保证浅底上的对比度；不传则跟随图标色。 */
  titleColor?: string;
  /** 图标底块的柔和底色。 */
  soft: string;
  title: string;
  text?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** 弹窗内的紧凑尺寸。 */
  compact?: boolean;
  /** 传了就用状态开关替代右侧箭头，整行点击即切换。 */
  switchValue?: boolean;
};

/** 设置页与数据库页共用的「图标 + 标题 + 说明」卡片行。 */
export function PillRow({
  icon,
  color,
  titleColor,
  soft,
  title,
  text,
  onPress,
  disabled = false,
  busy = false,
  compact = false,
  switchValue,
}: PillRowProps) {
  const withSwitch = switchValue !== undefined;
  return (
    <Pressable
      style={({ pressed }) => [styles.pill, compact && styles.pillCompact, pressed && styles.pillPressed]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={withSwitch ? 'switch' : 'button'}
      accessibilityLabel={title}
      accessibilityState={withSwitch ? { checked: switchValue, disabled } : { disabled }}
    >
      <View style={[styles.pillIcon, compact && styles.pillIconCompact, { backgroundColor: soft }]}>
        <MaterialCommunityIcons name={icon} size={compact ? 20 : 22} color={color} />
      </View>
      <View style={styles.pillBody}>
        <Text maxFontSizeMultiplier={textScale.body} style={[styles.pillTitle, { color: titleColor ?? color }]}>{title}</Text>
        {text ? <Text maxFontSizeMultiplier={textScale.body} style={styles.pillText}>{text}</Text> : null}
      </View>
      {busy ? (
        <ActivityIndicator color={color} />
      ) : withSwitch ? (
        /*
          开关设置 pointerEvents="none" 并再包一层同样为 none 的 View，
          确保原生 Switch 不会拦截/吞掉触摸，也不会与整行的 onPress 各触发一次相互抵消。
        */
        <View pointerEvents="none">
          <Switch
            value={switchValue}
            pointerEvents="none"
            trackColor={{ false: colors.line, true: colors.green }}
            thumbColor={colors.white}
            ios_backgroundColor={colors.line}
          />
        </View>
      ) : (
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    ...elevation.card,
  },
  pillCompact: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  pillPressed: {
    backgroundColor: colors.bg,
  },
  pillIcon: {
    width: size.iconTile,
    height: size.iconTile,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillIconCompact: {
    width: size.iconTileSm,
    height: size.iconTileSm,
    borderRadius: radius.sm,
  },
  pillBody: {
    flex: 1,
    gap: space.xs,
  },
  pillTitle: {
    ...type.bodyLg,
    fontWeight: weight.bold,
  },
  pillText: {
    color: colors.muted,
    ...type.caption,
    fontWeight: weight.regular,
  },
});
