import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useInventory } from '@/context/InventoryContext';
import { barcodeSummary } from '@/lib/format';
import type { Product } from '@/lib/types';
import { colors, shadow } from '@/theme';

const actions = [
  { mode: 'inbound', label: '入库扫描', icon: 'tray-arrow-down', color: colors.teal, soft: colors.tealSoft },
  { mode: 'outbound', label: '出库扫描', icon: 'tray-arrow-up', color: colors.clay, soft: colors.claySoft },
  { mode: 'query', label: '库存查询', icon: 'barcode-scan', color: colors.navy, soft: colors.navySoft },
] as const;

/** 底部浮动操作条占用的高度，列表底部留白必须大于它，避免遮挡最后一行卡片。 */
const ACTION_BAR_HEIGHT = 78;
const ACTION_BAR_GAP = 16;

export default function InventoryScreen() {
  const { products } = useInventory();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const cardWidth = (width - 32 - 12) / 2;

  // 离开本 Tab 时收起搜索框并清空关键词，用户切回时直接是默认的全量列表视图。
  useFocusEffect(
    useCallback(() => {
      return () => {
        setSearchOpen(false);
        setQuery('');
      };
    }, []),
  );

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const matched = keyword
      ? products.filter((product) => product.name.toLowerCase().includes(keyword))
      : products;
    // 库存从低到高，让缺货、库存紧张的商品排在最上方，方便及时补货。
    return [...matched].sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, 'zh'));
  }, [products, query]);

  const totalStock = products.reduce((sum, product) => sum + product.stock, 0);

  const closeSearch = () => {
    setQuery('');
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
              <Text style={styles.title}>Inven Go</Text>
              <Text style={styles.subtitle}>
                {products.length} 种商品 · 共 {totalStock} 件
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
              onPress={() => setSearchOpen(true)}
              accessibilityLabel="搜索商品"
            >
              <MaterialCommunityIcons name="magnify" size={22} color={colors.ink} />
            </Pressable>
          </>
        )}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[styles.list, { paddingBottom: ACTION_BAR_HEIGHT + ACTION_BAR_GAP + 24 }]}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          products.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="package-variant" size={42} color={colors.muted} />
              <Text style={styles.emptyTitle}>仓库还是空的</Text>
              <Text style={styles.emptyText}>点击下方「入库扫描」，扫到新条码后即可创建商品。</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="magnify-close" size={42} color={colors.muted} />
              <Text style={styles.emptyTitle}>没有匹配的商品</Text>
              <Text style={styles.emptyText}>没有名称包含「{query.trim()}」的商品，换个关键词试试。</Text>
              <Pressable style={styles.emptyAction} onPress={() => setQuery('')}>
                <Text style={styles.emptyActionText}>清空搜索</Text>
              </Pressable>
            </View>
          )
        }
        renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
      />

      <View style={[styles.actionBarWrap, { bottom: ACTION_BAR_GAP }]} pointerEvents="box-none">
        <View style={styles.actionBar}>
          {actions.map((action, index) => (
            <Fragment key={action.mode}>
              {index > 0 ? <View style={styles.actionDivider} /> : null}
              <Pressable
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                onPress={() => router.push(`/scan/${action.mode}`)}
                accessibilityLabel={action.label}
              >
                <View style={[styles.actionIcon, { backgroundColor: action.soft }]}>
                  <MaterialCommunityIcons name={action.icon} size={22} color={action.color} />
                </View>
                <Text style={[styles.actionLabel, { color: action.color }]}>{action.label}</Text>
              </Pressable>
            </Fragment>
          ))}
        </View>
      </View>
    </View>
  );
}

function ProductCard({ product, width }: { product: Product; width: number }) {
  // 0 件标红表示缺货，1 件标黄提醒库存紧张，其余为正常色。
  const stockStyle =
    product.stock === 0 ? styles.stockEmpty : product.stock === 1 ? styles.stockLow : undefined;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
      onPress={() => router.push(`/product/${product.id}`)}
    >
      <Text style={styles.name} numberOfLines={2}>
        {product.name}
      </Text>
      <Text style={[styles.stock, stockStyle]}>{product.stock}</Text>
      <Text style={styles.stockLabel}>当前库存</Text>
      <Text style={styles.barcode} numberOfLines={1}>
        {barcodeSummary(product.barcodes)}
      </Text>
    </Pressable>
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
  list: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  row: {
    gap: 12,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow,
  },
  pressed: {
    opacity: 0.75,
  },
  name: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
    minHeight: 48,
    lineHeight: 24,
  },
  stock: {
    marginTop: 8,
    color: colors.teal,
    fontSize: 32,
    fontWeight: '800',
  },
  stockEmpty: {
    color: colors.danger,
  },
  stockLow: {
    color: colors.warning,
  },
  stockLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  barcode: {
    marginTop: 10,
    color: colors.navy,
    fontSize: 12,
    fontWeight: '600',
  },
  actionBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 8,
    ...shadow,
    shadowOpacity: 0.14,
    elevation: 8,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderRadius: 18,
  },
  actionPressed: {
    backgroundColor: colors.bg,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  actionDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: 10,
  },
  empty: {
    marginTop: 48,
    alignItems: 'center',
    paddingHorizontal: 24,
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
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionText: {
    color: colors.teal,
    fontSize: 14,
    fontWeight: '800',
  },
});
