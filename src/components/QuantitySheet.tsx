import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QuantityStepper } from '@/components/QuantityStepper';
import { SheetModal } from '@/components/SheetModal';
import { colors } from '@/theme';

type QuantitySheetProps = {
  visible: boolean;
  title: string;
  productName: string;
  hint?: string;
  quantity: number;
  onChangeQuantity: (value: number) => void;
  /**
   * 数量下限，默认 1。
   * 入库补录场景传「本次已入库件数」：面板只负责追加，不会把已经入库的量往下改。
   */
  min?: number;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** 从底部升起的数量录入面板，用于扫码命中或新增商品后修改本次入库数量。 */
export function QuantitySheet({
  visible,
  title,
  productName,
  hint,
  quantity,
  onChangeQuantity,
  min = 1,
  confirmLabel = '确认入库',
  busy = false,
  onConfirm,
  onClose,
}: QuantitySheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <SheetModal visible={visible} onRequestClose={onClose} sheetStyle={{ paddingBottom: insets.bottom + 18 }}>
      <View style={styles.handle} />
      {/* 可用高度不够时（例如小屏 + 键盘）由这里滚动，底部的取消/确认始终留在键盘之上。 */}
      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.name}>{productName}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}

        <Text style={styles.label}>入库数量</Text>
        <QuantityStepper value={quantity} onChange={onChangeQuantity} min={min} />
      </ScrollView>

      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={onClose} disabled={busy}>
          <Text style={styles.cancelText}>取消</Text>
        </Pressable>
        <Pressable
          style={[styles.confirm, busy && styles.disabled]}
          onPress={onConfirm}
          disabled={busy}
          accessibilityState={{ disabled: busy }}
        >
          <Text style={styles.confirmText}>{busy ? '处理中…' : confirmLabel}</Text>
        </Pressable>
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
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
    fontWeight: '800',
  },
  name: {
    marginTop: 8,
    color: colors.teal,
    fontSize: 17,
    fontWeight: '800',
  },
  hint: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    marginTop: 18,
    marginBottom: 8,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  actions: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 12,
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
  confirm: {
    flex: 1.4,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
  },
  confirmText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.6,
  },
});
