import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { QuantityStepper } from '@/components/QuantityStepper';
import { SheetModal } from '@/components/SheetModal';
import type { Product } from '@/lib/types';
import { colors, radius, size, space, state, textScale, type, weight } from '@/theme';

/**
 * 搜索结果列表的固定高度。
 * 不用 maxHeight：列表随匹配数量变高变矮会带着上方的输入框上下移动，
 * 键盘弹出时输入框会被一起拖进键盘后面；固定高度让面板尺寸不受搜索结果影响。
 */
const SEARCH_LIST_HEIGHT = size.searchListHeight;

export type ProductSelection = { type: 'new' } | { type: 'existing'; productId: string } | null;

type AddProductModalProps = {
  visible: boolean;
  barcode: string;
  query: string;
  name: string;
  selection: ProductSelection;
  products: Product[];
  quantity: number;
  error?: string | null;
  submitting?: boolean;
  onChangeBarcode: (value: string) => void;
  onChangeQuery: (value: string) => void;
  onChangeName: (value: string) => void;
  onChangeSelection: (selection: ProductSelection) => void;
  onChangeQuantity: (value: number) => void;
  onRescan: () => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function AddProductModal({
  visible,
  barcode,
  query,
  name,
  selection,
  products,
  quantity,
  error,
  submitting = false,
  onChangeBarcode,
  onChangeQuery,
  onChangeName,
  onChangeSelection,
  onChangeQuantity,
  onRescan,
  onClose,
  onSubmit,
}: AddProductModalProps) {
  const [listOpen, setListOpen] = useState(true);
  const formRef = useRef<ScrollView>(null);
  /** 「产品名称」在表单里的纵向位置：聚焦时把它滚到最上方，让下方的搜索结果一起露出来。 */
  const nameFieldY = useRef(0);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((product) => product.name.toLowerCase().includes(keyword));
  }, [products, query]);

  const selectedProduct =
    selection?.type === 'existing' ? products.find((product) => product.id === selection.productId) : undefined;

  return (
    <SheetModal visible={visible} onRequestClose={onClose}>
      <View style={styles.handle} />
      <Text style={styles.title} maxFontSizeMultiplier={textScale.title}>
        添加商品
      </Text>
      <Text maxFontSizeMultiplier={textScale.body} style={styles.subtitle}>一个产品可以绑定多个不同条码。确认添加时按下方数量入库。</Text>
      <ScrollView
        ref={formRef}
        style={styles.formScroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.form}
      >
        <Text maxFontSizeMultiplier={textScale.body} style={styles.label}>条形码</Text>
        <View style={styles.barcodeRow}>
          <TextInput
            value={barcode}
            onChangeText={onChangeBarcode}
            placeholder="扫描或输入条码"
            placeholderTextColor={colors.muted}
            style={styles.input}
            maxFontSizeMultiplier={textScale.body}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.rescan} onPress={onRescan}>
            <Text maxFontSizeMultiplier={textScale.body} style={styles.rescanText}>重新扫描</Text>
          </Pressable>
        </View>

        <Text maxFontSizeMultiplier={textScale.body} style={styles.label}>本次入库数量</Text>
        <QuantityStepper value={quantity} onChange={onChangeQuantity} />

        <View
          onLayout={(event) => {
            nameFieldY.current = event.nativeEvent.layout.y;
          }}
        >
          <Text maxFontSizeMultiplier={textScale.body} style={styles.label}>产品名称</Text>
          <TextInput
            value={query}
            onChangeText={(value) => {
              onChangeQuery(value);
              setListOpen(true);
            }}
            onFocus={() => {
              setListOpen(true);
              // 键盘顶起后面板会被压缩，把输入框滚到最上方，下方列表才有位置显示匹配结果。
              formRef.current?.scrollTo({ y: Math.max(0, nameFieldY.current - 8), animated: true });
            }}
            placeholder="搜索已有产品，或输入新品名称"
            placeholderTextColor={colors.muted}
            style={styles.input}
            maxFontSizeMultiplier={textScale.body}
          />
        </View>

        {listOpen ? (
          <ScrollView
            style={styles.list}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            <Pressable
              style={styles.option}
              onPress={() => {
                onChangeSelection({ type: 'new' });
                onChangeName(query.trim());
                setListOpen(false);
              }}
            >
              <Text maxFontSizeMultiplier={textScale.body} style={styles.createTitle}>+ 新增产品</Text>
              <Text maxFontSizeMultiplier={textScale.body} style={styles.createHint}>
                {query.trim()
                  ? filtered.length === 0
                    ? `没有匹配项，将使用「${query.trim()}」`
                    : `使用「${query.trim()}」创建新品类`
                  : '先输入名称，再点此项自动填入'}
              </Text>
            </Pressable>
            {filtered.map((product) => {
              const active = selection?.type === 'existing' && selection.productId === product.id;
              return (
                <Pressable
                  key={product.id}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => {
                    onChangeSelection({ type: 'existing', productId: product.id });
                    onChangeQuery(product.name);
                    setListOpen(false);
                  }}
                >
                  <Text maxFontSizeMultiplier={textScale.body} style={styles.optionTitle}>{product.name}</Text>
                  <Text maxFontSizeMultiplier={textScale.body} style={styles.optionMeta}>库存 {product.stock} · {product.barcodes.length} 个条码</Text>
                </Pressable>
              );
            })}
            {/* 没有匹配项时补一行说明，避免留下一个只有「+ 新增产品」的空白框。 */}
            {filtered.length === 0 ? <Text maxFontSizeMultiplier={textScale.body} style={styles.listEmpty}>没有找到已有产品，可直接新建。</Text> : null}
          </ScrollView>
        ) : null}

        {selection?.type === 'new' ? (
          <View>
            <Text maxFontSizeMultiplier={textScale.body} style={styles.label}>新品类名称</Text>
            <TextInput
              value={name}
              onChangeText={onChangeName}
              placeholder="确认新产品名称"
              placeholderTextColor={colors.muted}
              style={styles.input}
              maxFontSizeMultiplier={textScale.body}
            />
          </View>
        ) : null}

        {selectedProduct ? (
          <View style={styles.bindBox}>
            <Text maxFontSizeMultiplier={textScale.body} style={styles.bindText}>将把条码绑定到「{selectedProduct.name}」，并入库 {quantity} 件。</Text>
          </View>
        ) : null}

        {error ? <Text maxFontSizeMultiplier={textScale.body} style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={onClose} disabled={submitting}>
          <Text maxFontSizeMultiplier={textScale.body} style={styles.cancelText}>取消</Text>
        </Pressable>
        <Pressable style={[styles.save, submitting && styles.disabled]} onPress={onSubmit} disabled={submitting}>
          <Text maxFontSizeMultiplier={textScale.body} style={styles.saveText}>{submitting ? '保存中…' : '确认添加'}</Text>
        </Pressable>
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  handle: {
    alignSelf: 'center',
    width: size.sheetHandle,
    height: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    marginBottom: space.md,
  },
  title: {
    color: colors.ink,
    ...type.heading,
    fontWeight: weight.bold,
  },
  subtitle: {
    marginTop: space.sm,
    color: colors.muted,
    ...type.caption,
    fontWeight: weight.regular,
  },
  formScroll: {
    // 可用高度不够时优先压缩表单区（内部可滚动），保证底部「取消 / 确认添加」始终露出。
    flexShrink: 1,
  },
  form: {
    paddingTop: space.lg,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  label: {
    marginTop: space.sm,
    color: colors.ink,
    ...type.caption,
    fontWeight: weight.bold,
  },
  barcodeRow: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: size.control,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    paddingHorizontal: space.md,
    color: colors.ink,
    ...type.body,
  },
  rescan: {
    minHeight: size.control,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rescanText: {
    color: colors.white,
    ...type.bodyTight,
    fontWeight: weight.bold,
  },
  list: {
    height: SEARCH_LIST_HEIGHT,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.card,
  },
  optionActive: {
    backgroundColor: colors.tealSoft,
  },
  createTitle: {
    color: colors.tealStrong,
    ...type.body,
    fontWeight: weight.bold,
  },
  createHint: {
    marginTop: space.xs,
    color: colors.muted,
    ...type.caption,
    fontWeight: weight.regular,
  },
  optionTitle: {
    color: colors.ink,
    ...type.body,
    fontWeight: weight.bold,
  },
  optionMeta: {
    marginTop: space.xs,
    color: colors.muted,
    ...type.caption,
    fontWeight: weight.regular,
  },
  listEmpty: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    color: colors.muted,
    ...type.caption,
    fontWeight: weight.regular,
  },
  bindBox: {
    marginTop: space.sm,
    backgroundColor: colors.tealSoft,
    borderRadius: radius.md,
    padding: space.md,
  },
  bindText: {
    color: colors.tealStrong,
    ...type.caption,
    fontWeight: weight.regular,
  },
  error: {
    color: colors.dangerStrong,
    ...type.caption,
    fontWeight: weight.bold,
  },
  actions: {
    flexDirection: 'row',
    gap: space.md,
    paddingTop: space.sm,
  },
  cancel: {
    flex: 1,
    minHeight: size.control,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  cancelText: {
    color: colors.ink,
    ...type.bodyLg,
    fontWeight: weight.regular,
  },
  save: {
    flex: 1.4,
    minHeight: size.control,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
  },
  saveText: {
    color: colors.white,
    ...type.bodyLg,
    fontWeight: weight.bold,
  },
  disabled: {
    opacity: state.disabled,
  },
});
