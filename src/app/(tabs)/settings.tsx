import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillRow } from '@/components/PillRow';
import { getAppVersion } from '@/constants/appInfo';
import { useInventory } from '@/context/InventoryContext';
import { colors, radius, space, textScale, type, weight } from '@/theme';

export default function SettingsScreen() {
  const { products, logs, databases, activeDatabaseId } = useInventory();
  const insets = useSafeAreaInsets();

  const activeName = databases.find((item) => item.id === activeDatabaseId)?.name ?? '';

  const mainActions = [
    {
      key: 'database',
      title: '数据库管理',
      text: '查看、管理及切换数据库',
      icon: 'database-outline' as const,
      color: colors.green,
      titleColor: colors.greenStrong,
      soft: colors.greenSoft,
      onPress: () => router.push('/database'),
    },
    {
      key: 'about',
      title: '关于',
      text: `版本号：${getAppVersion()}`,
      icon: 'information-outline' as const,
      // 沿用【日志】页「导出」日志的配色，保持整套系统主题色一致。
      color: colors.warning,
      titleColor: colors.warningStrong,
      soft: colors.warningSoft,
      onPress: () => router.push('/about'),
    },
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.titleWrap}>
          <Text style={styles.title} maxFontSizeMultiplier={textScale.title}>
            设置
          </Text>
          <Text maxFontSizeMultiplier={textScale.body} style={styles.subtitle}>软件数据管理</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.summary}>
          <Text maxFontSizeMultiplier={textScale.body} style={styles.summaryLabel}>{`当前数据库：${activeName}`}</Text>
          <Text style={styles.summaryValue} maxFontSizeMultiplier={textScale.title}>
            {products.length} 个商品 · {logs.length} 条日志
          </Text>
          <Text maxFontSizeMultiplier={textScale.body} style={styles.summaryHint}>库存、条码关系和全部日志都保存在这台设备上。</Text>
        </View>

        <View style={styles.actions}>
          {mainActions.map((action) => (
            <PillRow
              key={action.key}
              icon={action.icon}
              color={action.color}
              titleColor={action.titleColor}
              soft={action.soft}
              title={action.title}
              text={action.text}
              onPress={action.onPress}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    ...type.display,
    color: colors.ink,
    fontWeight: weight.bold,
  },
  subtitle: {
    marginTop: space.xs,
    ...type.caption,
    color: colors.muted,
    fontWeight: weight.regular,
  },
  body: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.md,
  },
  summary: {
    backgroundColor: colors.ink,
    borderRadius: radius.xl,
    padding: space.xl,
    gap: space.sm,
  },
  summaryLabel: {
    color: colors.onInkMuted,
    ...type.caption,
    fontWeight: weight.regular,
  },
  summaryValue: {
    color: colors.onInk,
    ...type.heading,
    fontWeight: weight.bold,
    fontVariant: ['tabular-nums'],
  },
  summaryHint: {
    color: colors.onInkFaint,
    ...type.body,
    fontWeight: weight.regular,
  },
  actions: {
    gap: space.md,
  },
});
