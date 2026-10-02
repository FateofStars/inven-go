import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillRow } from '@/components/PillRow';
import { getAppVersion } from '@/constants/appInfo';
import { useInventory } from '@/context/InventoryContext';
import { colors } from '@/theme';

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
      soft: colors.warningSoft,
      onPress: () => router.push('/about'),
    },
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>设置</Text>
          <Text style={styles.subtitle}>软件数据管理</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>{`当前数据库：${activeName}`}</Text>
          <Text style={styles.summaryValue}>
            {products.length} 个商品 · {logs.length} 条日志
          </Text>
          <Text style={styles.summaryHint}>库存、条码关系和全部日志都保存在这台设备上。</Text>
        </View>

        <View style={styles.actions}>
          {mainActions.map((action) => (
            <PillRow
              key={action.key}
              icon={action.icon}
              color={action.color}
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
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  summary: {
    backgroundColor: colors.ink,
    borderRadius: 22,
    padding: 18,
    gap: 6,
  },
  summaryLabel: {
    color: '#D9CBB8',
    fontSize: 13,
    fontWeight: '700',
  },
  summaryValue: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
  summaryHint: {
    color: '#C8BEB0',
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    gap: 10,
  },
});
