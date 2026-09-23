import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useInventory } from '@/context/InventoryContext';
import { formatTimestamp } from '@/lib/format';
import { type LogEntry, type LogType } from '@/lib/types';
import { colors, shadow } from '@/theme';

const tone: Record<LogType, { color: string; soft: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  inbound: { color: colors.teal, soft: colors.tealSoft, icon: 'tray-arrow-down' },
  outbound: { color: colors.clay, soft: colors.claySoft, icon: 'tray-arrow-up' },
  create: { color: colors.navy, soft: colors.navySoft, icon: 'plus-box-outline' },
  delete: { color: colors.danger, soft: colors.dangerSoft, icon: 'trash-can-outline' },
  import: { color: colors.navy, soft: colors.navySoft, icon: 'database-import-outline' },
  export: { color: colors.warning, soft: colors.warningSoft, icon: 'database-export-outline' },
};

type TimeRange = 'all' | 'today' | 'week' | 'month';

const typeOptions: { key: LogType | 'all'; label: string }[] = [
  { key: 'all', label: '全部类型' },
  { key: 'inbound', label: '入库' },
  { key: 'outbound', label: '出库' },
  { key: 'create', label: '新增' },
  { key: 'delete', label: '删除' },
  { key: 'export', label: '导出' },
  { key: 'import', label: '导入' },
];

const timeOptions: { key: TimeRange; label: string }[] = [
  { key: 'all', label: '全部时间' },
  { key: 'today', label: '今天' },
  { key: 'week', label: '近 7 天' },
  { key: 'month', label: '近 30 天' },
];

const DAY = 24 * 60 * 60 * 1000;

function rangeStart(range: TimeRange): number {
  if (range === 'all') return 0;
  if (range === 'week') return Date.now() - 7 * DAY;
  if (range === 'month') return Date.now() - 30 * DAY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

export default function LogsScreen() {
  const { logs } = useInventory();
  const insets = useSafeAreaInsets();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<LogType | 'all'>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  // 离开本 Tab 时收起筛选面板并清空全部筛选条件，切回时直接是完整日志流水。
  useFocusEffect(
    useCallback(() => {
      return () => {
        setSearchOpen(false);
        setQuery('');
        setTypeFilter('all');
        setTimeRange('all');
      };
    }, []),
  );

  const filtering = query.trim() !== '' || typeFilter !== 'all' || timeRange !== 'all';

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const from = rangeStart(timeRange);
    return [...logs]
      .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))
      .filter(
        (entry) =>
          (typeFilter === 'all' || entry.type === typeFilter) &&
          entry.timestamp >= from &&
          (keyword === '' || entry.detail.toLowerCase().includes(keyword)),
      );
  }, [logs, query, typeFilter, timeRange]);

  const reset = () => {
    setQuery('');
    setTypeFilter('all');
    setTimeRange('all');
  };

  const closeSearch = () => {
    reset();
    setSearchOpen(false);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        {searchOpen ? (
          <>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="输入商品名称搜索"
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length > 0 ? (
                <Pressable hitSlop={10} onPress={() => setQuery('')} accessibilityLabel="清空搜索">
                  <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            <Pressable style={styles.cancel} onPress={closeSearch} hitSlop={8}>
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.titleWrap}>
              <Text style={styles.title}>日志</Text>
              <Text style={styles.subtitle}>
                {filtering ? `筛选出 ${visible.length} / ${logs.length} 条` : `共 ${logs.length} 条记录`}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
              onPress={() => setSearchOpen(true)}
              accessibilityLabel="搜索与筛选日志"
            >
              <MaterialCommunityIcons name="filter-variant" size={22} color={colors.ink} />
            </Pressable>
          </>
        )}
      </View>

      {searchOpen ? (
        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>操作类型</Text>
            {filtering ? (
              <Pressable hitSlop={8} onPress={reset}>
                <Text style={styles.reset}>重置筛选</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.chipRow}>
              {typeOptions.map((option) => (
                <FilterChip
                  key={option.key}
                  label={option.label}
                  active={typeFilter === option.key}
                  onPress={() => setTypeFilter(option.key)}
                />
              ))}
            </View>
          </ScrollView>

          <Text style={[styles.panelTitle, styles.panelTitleSpaced]}>操作时间</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.chipRow}>
              {timeOptions.map((option) => (
                <FilterChip
                  key={option.key}
                  label={option.label}
                  active={timeRange === option.key}
                  onPress={() => setTimeRange(option.key)}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={visible}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          filtering ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="filter-remove-outline" size={42} color={colors.muted} />
              <Text style={styles.emptyTitle}>没有符合条件的日志</Text>
              <Text style={styles.emptyText}>换个操作类型或时间范围试试，也可以清空搜索关键词。</Text>
              <Pressable style={styles.emptyAction} onPress={reset}>
                <Text style={styles.emptyActionText}>清空筛选条件</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="clipboard-text-clock-outline" size={42} color={colors.muted} />
              <Text style={styles.emptyTitle}>还没有操作记录</Text>
              <Text style={styles.emptyText}>入库、出库、新增、删除以及导入导出会出现在这里。</Text>
            </View>
          )
        }
        renderItem={({ item }) => <LogRow entry={item} />}
      />
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const palette = tone[entry.type];
  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: palette.soft }]}>
        <MaterialCommunityIcons name={palette.icon} size={22} color={palette.color} />
      </View>
      <View style={styles.body}>
        <View style={styles.rowHead}>
          <Text style={[styles.badge, { color: palette.color }]}>{typeLabel(entry.type)}</Text>
          <Text style={styles.time}>{formatTimestamp(entry.timestamp)}</Text>
        </View>
        <Text style={styles.detail}>{entry.detail}</Text>
      </View>
    </View>
  );
}

function typeLabel(type: LogType): string {
  const option = typeOptions.find((item) => item.key === type);
  return option ? option.label : type;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    color: colors.ink,
    fontSize: 15,
  },
  cancel: {
    paddingHorizontal: 2,
  },
  cancelText: {
    color: colors.navy,
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
  panel: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  panelTitleSpaced: {
    marginTop: 14,
  },
  reset: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 10,
    paddingRight: 4,
  },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: colors.teal,
    backgroundColor: colors.tealSoft,
  },
  chipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.teal,
  },
  list: {
    flex: 1,
  },
  content: {
    gap: 10,
    flexGrow: 1,
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 6,
  },
  rowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    fontSize: 14,
    fontWeight: '800',
  },
  time: {
    color: colors.muted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  detail: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  empty: {
    marginTop: 56,
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 8,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: 8,
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: colors.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionText: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '800',
  },
});
