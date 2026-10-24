import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QuantityStepper } from '@/components/QuantityStepper';
import { SheetModal } from '@/components/SheetModal';
import { colors, radius, size, space, state, textScale, type, weight } from '@/theme';

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
    <SheetModal visible={visible} onRequestClose={onClose} sheetStyle={{ paddingBottom: insets.bottom + space.lg }}>
      <View style={styles.handle} />
      {/* 可用高度不够时（例如小屏 + 键盘）由这里滚动，底部的取消/确认始终留在键盘之上。 */}
      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.title} maxFontSizeMultiplier={textScale.title}>
          {title}
        </Text>
        <Text style={styles.name} maxFontSizeMultiplier={textScale.title}>
          {productName}
        </Text>
        {hint ? <Text maxFontSizeMultiplier={textScale.body} style={styles.hint}>{hint}</Text> : null}

        <Text maxFontSizeMultiplier={textScale.body} style={styles.label}>入库数量</Text>
        <QuantityStepper value={quantity} onChange={onChangeQuantity} min={min} />
      </ScrollView>

      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={onClose} disabled={busy}>
          <Text maxFontSizeMultiplier={textScale.body} style={styles.cancelText}>取消</Text>
        </Pressable>
        <Pressable
          style={[styles.confirm, busy && styles.disabled]}
          onPress={onConfirm}
          disabled={busy}
          accessibilityState={{ disabled: busy }}
        >
          <Text maxFontSizeMultiplier={textScale.body} style={styles.confirmText}>{busy ? '处理中…' : confirmLabel}</Text>
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
  name: {
    marginTop: space.sm,
    color: colors.tealStrong,
    ...type.title,
    fontWeight: weight.bold,
  },
  hint: {
    marginTop: space.sm,
    color: colors.muted,
    ...type.body,
    fontWeight: weight.regular,
  },
  label: {
    marginTop: space.xl,
    marginBottom: space.sm,
    color: colors.ink,
    ...type.caption,
    fontWeight: weight.bold,
  },
  actions: {
    marginTop: space.xl,
    flexDirection: 'row',
    gap: space.md,
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
  confirm: {
    flex: 1.4,
    minHeight: size.control,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
  },
  confirmText: {
    color: colors.white,
    ...type.bodyLg,
    fontWeight: weight.bold,
  },
  disabled: {
    opacity: state.disabled,
  },
});
