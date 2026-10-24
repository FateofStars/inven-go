import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useInventory } from '@/context/InventoryContext';
import { formatTimestamp } from '@/lib/format';
import { type LogEntry, type LogType } from '@/lib/types';
import { colors, elevation, press, radius, size, space, textScale, type, weight } from '@/theme';

/**
 * 日志类型配色：`color` 给图标，`text` 给浅底上的标签文字（深档保证 4.5:1），`soft` 给图标底块。
 */
const tone: Record<
  LogType,
  { color: string; text: string; soft: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  inbound: { color: colors.teal, text: colors.tealStrong, soft: colors.tealSoft, icon: 'tray-arrow-down' },
  outbound: { color: colors.clay, text: colors.clayStrong, soft: colors.claySoft, icon: 'tray-arrow-up' },
  create: { color: colors.navy, text: colors.navyStrong, soft: colors.navySoft, icon: 'plus-box-outline' },
  delete: { color: colors.danger, text: colors.dangerStrong, soft: colors.dangerSoft, icon: 'trash-can-outline' },
  import: { color: colors.navy, text: colors.navyStrong, soft: colors.navySoft, icon: 'database-import-outline' },
  export: { color: colors.warning, text: colors.warningStrong, soft: colors.warningSoft, icon: 'database-export-outline' },
  barcode: { color: colors.green, text: colors.greenStrong, soft: colors.greenSoft, icon: 'barcode' },
};

type TimeRange = 'all' | 'today' | 'week' | 'month';

const typeOptions: { key: LogType | 'all'; label: string }[] = [
  { key: 'all', label: '全部类型' },
  { key: 'inbound', label: '入库' },
  { key: 'outbound', label: '出库' },
  { key: 'create', label: '新增' },
  { key: 'delete', label: '删除' },
  { key: 'barcode', label: '条码更新' },
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
  const listRef = useRef<FlatList<LogEntry>>(null);

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

  /** 点标题平滑回到列表顶部。 */
  const scrollToTop = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
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
                maxFontSizeMultiplier={textScale.body}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length > 0 ? (
                <Pressable
                  style={styles.searchClear}
                  onPress={() => setQuery('')}
                  accessibilityLabel="清空搜索"
                >
                  <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            <Pressable style={styles.cancel} onPress={closeSearch} hitSlop={space.md}>
              <Text maxFontSizeMultiplier={textScale.body} style={styles.cancelText}>取消</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.titleWrap}>
              {/* 热区只包住左边的标题文字，右侧筛选按钮保持独立可点。 */}
              <Pressable
                style={({ pressed }) => [styles.titleTap, pressed && styles.pressed]}
                onPress={scrollToTop}
                accessibilityLabel="回到顶部"
              >
                <Text style={styles.title} maxFontSizeMultiplier={textScale.title}>
                  日志
                </Text>
                <Text maxFontSizeMultiplier={textScale.body} style={styles.subtitle}>
                  {filtering ? `筛选出 ${visible.length} / ${logs.length} 条` : `共 ${logs.length} 条记录`}
                </Text>
              </Pressable>
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
            <Text maxFontSizeMultiplier={textScale.body} style={styles.panelTitle}>操作类型</Text>
            {filtering ? (
              <Pressable hitSlop={space.lg} onPress={reset}>
                <Text maxFontSizeMultiplier={textScale.body} style={styles.reset}>重置筛选</Text>
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

          <Text maxFontSizeMultiplier={textScale.body} style={[styles.panelTitle, styles.panelTitleSpaced]}>操作时间</Text>
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
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.content}
        data={visible}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          filtering ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="filter-remove-outline" size={size.emptyIcon} color={colors.muted} />
              <Text style={styles.emptyTitle} maxFontSizeMultiplier={textScale.title}>
                没有符合条件的日志
              </Text>
              <Text maxFontSizeMultiplier={textScale.body} style={styles.emptyText}>换个操作类型或时间范围试试，也可以清空搜索关键词。</Text>
              <Pressable style={styles.emptyAction} onPress={reset}>
                <Text maxFontSizeMultiplier={textScale.body} style={styles.emptyActionText}>清空筛选条件</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="clipboard-text-clock-outline" size={size.emptyIcon} color={colors.muted} />
              <Text style={styles.emptyTitle} maxFontSizeMultiplier={textScale.title}>
                还没有操作记录
              </Text>
              <Text maxFontSizeMultiplier={textScale.body} style={styles.emptyText}>入库、出库、新增、删除、条码更新以及导入导出会出现在这里。</Text>
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
      <Text maxFontSizeMultiplier={textScale.body} style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
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
          <Text maxFontSizeMultiplier={textScale.body} style={[styles.badge, { color: palette.text }]}>{typeLabel(entry.type)}</Text>
          <Text maxFontSizeMultiplier={textScale.body} style={styles.time}>{formatTimestamp(entry.timestamp)}</Text>
        </View>
        <Text maxFontSizeMultiplier={textScale.body} style={styles.detail}>{entry.detail}</Text>
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
  /** 点击热区贴合标题文本宽度，不向右侧筛选按钮方向延展。 */
  titleTap: {
    alignSelf: 'flex-start',
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
  searchButton: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.card,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: size.touch,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: space.md,
    ...elevation.card,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    color: colors.ink,
    ...type.body,
  },
  /** 清空键做成 44×44 热区，视觉上仍贴着输入框右侧内边距。 */
  searchClear: {
    width: size.touch,
    height: size.touch,
    marginRight: -space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: {
    paddingHorizontal: space.xs,
  },
  cancelText: {
    color: colors.tealStrong,
    ...type.body,
    fontWeight: weight.bold,
  },
  pressed: {
    opacity: press.opacity,
  },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    ...elevation.card,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: colors.ink,
    ...type.caption,
    fontWeight: weight.bold,
  },
  panelTitleSpaced: {
    marginTop: space.lg,
  },
  reset: {
    color: colors.tealStrong,
    ...type.caption,
    fontWeight: weight.bold,
  },
  chipRow: {
    flexDirection: 'row',
    gap: space.sm,
    paddingTop: space.md,
    paddingRight: space.xs,
  },
  chip: {
    height: size.touch,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.tealSoft,
  },
  chipText: {
    color: colors.muted,
    ...type.bodyTight,
    fontWeight: weight.regular,
  },
  chipTextActive: {
    color: colors.tealStrong,
    fontWeight: weight.bold,
  },
  list: {
    flex: 1,
  },
  content: {
    // 页边距交给内容区：列表本身铺满全宽，滚动条才会贴屏幕右缘，与库存管理页一致。
    paddingHorizontal: space.lg,
    gap: space.sm,
    flexGrow: 1,
    paddingBottom: space.xl,
  },
  row: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    ...elevation.card,
  },
  iconWrap: {
    width: size.iconTile,
    height: size.iconTile,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: space.xs,
  },
  rowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  badge: {
    ...type.caption,
    fontWeight: weight.bold,
  },
  time: {
    color: colors.muted,
    ...type.caption,
    fontWeight: weight.regular,
    fontVariant: ['tabular-nums'],
  },
  detail: {
    color: colors.ink,
    ...type.body,
    fontWeight: weight.regular,
  },
  empty: {
    marginTop: space.xxl,
    alignItems: 'center',
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  emptyTitle: {
    color: colors.ink,
    ...type.title,
    fontWeight: weight.bold,
  },
  emptyText: {
    color: colors.muted,
    ...type.body,
    fontWeight: weight.regular,
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: space.sm,
    minHeight: size.touch,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionText: {
    color: colors.navyStrong,
    ...type.body,
    fontWeight: weight.bold,
  },
});
