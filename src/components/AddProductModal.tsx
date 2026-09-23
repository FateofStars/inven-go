import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Product } from '@/lib/types';
import { colors } from '@/theme';

export type ProductSelection = { type: 'new' } | { type: 'existing'; productId: string } | null;

type AddProductModalProps = {
  visible: boolean;
  barcode: string;
  query: string;
  name: string;
  selection: ProductSelection;
  products: Product[];
  error?: string | null;
  submitting?: boolean;
  onChangeBarcode: (value: string) => void;
  onChangeQuery: (value: string) => void;
  onChangeName: (value: string) => void;
  onChangeSelection: (selection: ProductSelection) => void;
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
  error,
  submitting = false,
  onChangeBarcode,
  onChangeQuery,
  onChangeName,
  onChangeSelection,
  onRescan,
  onClose,
  onSubmit,
}: AddProductModalProps) {
  const [listOpen, setListOpen] = useState(true);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((product) => product.name.toLowerCase().includes(keyword));
  }, [products, query]);

  const selectedProduct =
    selection?.type === 'existing' ? products.find((product) => product.id === selection.productId) : undefined;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>添加商品</Text>
          <Text style={styles.subtitle}>一个产品可以绑定多个不同条码。新商品会以当前条码入库 1 件。</Text>
          <ScrollView
            style={styles.formScroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.form}
          >
            <Text style={styles.label}>条形码</Text>
            <View style={styles.barcodeRow}>
              <TextInput
                value={barcode}
                onChangeText={onChangeBarcode}
                placeholder="扫描或输入条码"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable style={styles.rescan} onPress={onRescan}>
                <Text style={styles.rescanText}>重新扫描</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>产品名称</Text>
            <TextInput
              value={query}
              onChangeText={(value) => {
                onChangeQuery(value);
                setListOpen(true);
              }}
              onFocus={() => setListOpen(true)}
              placeholder="搜索已有产品，或输入新品名称"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

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
                  <Text style={styles.createTitle}>+ 新增产品</Text>
                  <Text style={styles.createHint}>
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
                      <Text style={styles.optionTitle}>{product.name}</Text>
                      <Text style={styles.optionMeta}>库存 {product.stock} · {product.barcodes.length} 个条码</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            {selection?.type === 'new' ? (
              <View>
                <Text style={styles.label}>新品类名称</Text>
                <TextInput
                  value={name}
                  onChangeText={onChangeName}
                  placeholder="确认新产品名称"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </View>
            ) : null}

            {selectedProduct ? (
              <View style={styles.bindBox}>
                <Text style={styles.bindText}>将把条码绑定到「{selectedProduct.name}」，并入库 1 件。</Text>
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onClose} disabled={submitting}>
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
            <Pressable style={[styles.save, submitting && styles.disabled]} onPress={onSubmit} disabled={submitting}>
              <Text style={styles.saveText}>{submitting ? '保存中…' : '确认添加'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
  },
  sheet: {
    maxHeight: '92%',
    // flexShrink 让卡片在键盘顶起、可用高度变小时收缩，而不是把底部按钮挤出可视区。
    flexShrink: 1,
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 12,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  formScroll: {
    // 键盘弹起时优先压缩滚动区（内部可滚动），保证底部「取消 / 确认添加」始终露出。
    flexShrink: 1,
  },
  form: {
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  label: {
    marginTop: 8,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  barcodeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 15,
  },
  rescan: {
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rescanText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    maxHeight: 220,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.white,
  },
  optionActive: {
    backgroundColor: colors.tealSoft,
  },
  createTitle: {
    color: colors.teal,
    fontSize: 15,
    fontWeight: '800',
  },
  createHint: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
  },
  optionTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  optionMeta: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
  },
  bindBox: {
    marginTop: 8,
    backgroundColor: colors.tealSoft,
    borderRadius: 14,
    padding: 12,
  },
  bindText: {
    color: colors.teal,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
  },
  cancel: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  cancelText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  save: {
    flex: 1.4,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
  },
  saveText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.6,
  },
});
