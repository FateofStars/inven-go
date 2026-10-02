import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { colors, shadow } from '@/theme';

type PillRowProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  /** 图标与标题共用的主色。 */
  color: string;
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

/** 设置页与数据库页共用的「图标 + 标题 + 说明」圆角卡片行。 */
export function PillRow({
  icon,
  color,
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
        <MaterialCommunityIcons name={icon} size={compact ? 19 : 22} color={color} />
      </View>
      <View style={styles.pillBody}>
        <Text style={[styles.pillTitle, compact && styles.pillTitleCompact, { color }]}>{title}</Text>
        {text ? <Text style={styles.pillText}>{text}</Text> : null}
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
        <MaterialCommunityIcons name="chevron-right" size={compact ? 20 : 22} color={colors.muted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 14,
    ...shadow,
  },
  pillCompact: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowOpacity: 0.04,
    elevation: 1,
  },
  pillPressed: {
    backgroundColor: colors.bg,
  },
  pillIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillIconCompact: {
    width: 32,
    height: 32,
    borderRadius: 11,
  },
  pillBody: {
    flex: 1,
    gap: 4,
  },
  pillTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  pillTitleCompact: {
    fontSize: 15,
  },
  pillText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
