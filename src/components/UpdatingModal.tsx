import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, elevation, press, radius, size, space, textScale, type, weight } from '@/theme';

export type UpgradeStatus = 'processing' | 'completed';

type UpdatingModalProps = {
  visible: boolean;
  status: UpgradeStatus;
  /** 处理中为「取消操作」（终止流程），完成态为「取消」（放弃本次更新）。 */
  onCancel: () => void;
  /** 完成态的主操作：活跃库写回本机，外部备份进入导出流程。 */
  onApply: () => void;
  /** 活跃库升级前已在本地留过快照，完成页补充一条恢复指引。 */
  showBackupNotice?: boolean;
};

/**
 * 「数据库更新」的统一状态弹窗：
 * processing 展示加载动画 + 可取消；completed 展示大号对勾与「应用更新」，
 * 完成态绝不自动关闭，必须由用户明确选择。
 */
export function UpdatingModal({
  visible,
  status,
  onCancel,
  onApply,
  showBackupNotice = false,
}: UpdatingModalProps) {
  const processing = status === 'processing';
  /** 完成态对勾的入场动画：从 Loading 位置平滑放大浮现。 */
  const [appear] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (processing) return;
    appear.setValue(0);
    Animated.spring(appear, {
      toValue: 1,
      friction: 6,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [appear, processing]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text maxFontSizeMultiplier={textScale.title} style={styles.title}>
            {processing ? '数据库更新中' : '数据库已更新'}
          </Text>

          <View style={styles.visual}>
            {processing ? (
              <ActivityIndicator size="large" color={colors.green} />
            ) : (
              <Animated.View style={{ opacity: appear, transform: [{ scale: appear }] }}>
                <MaterialCommunityIcons name="check-circle" size={54} color={colors.green} />
              </Animated.View>
            )}
          </View>

          <Text maxFontSizeMultiplier={textScale.body} style={styles.hint}>
            {processing ? '正在转换历史日志格式，请稍候...' : '已将全部历史日志清洗为最新结构，体积已大幅优化'}
          </Text>

          {!processing && showBackupNotice ? (
            <Text maxFontSizeMultiplier={textScale.body} style={styles.notice}>
              更新前已自动保留一份历史快照；若更新后出现问题，可在「导入数据库」页面导入该快照恢复。
            </Text>
          ) : null}

          {processing ? (
            <Pressable
              style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="取消操作"
            >
              <Text maxFontSizeMultiplier={textScale.body} style={styles.ghostText}>取消操作</Text>
            </Pressable>
          ) : (
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="取消"
              >
                <Text maxFontSizeMultiplier={textScale.body} style={styles.cancelText}>取消</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.apply, pressed && styles.pressed]}
                onPress={onApply}
                accessibilityRole="button"
                accessibilityLabel="应用更新"
              >
                <Text maxFontSizeMultiplier={textScale.body} style={styles.applyText}>应用更新</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: {
    width: '100%',
    maxWidth: size.modalMaxWidth,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: space.xl,
    ...elevation.modal,
  },
  title: {
    color: colors.ink,
    ...type.display,
    fontWeight: weight.bold,
  },
  /** 固定高度承载 Loading 与对勾，切换时不改变弹窗尺寸，视觉不跳动。 */
  visual: {
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    marginTop: space.sm,
    color: colors.muted,
    textAlign: 'center',
    ...type.body,
    fontWeight: weight.regular,
  },
  /** 完成态的恢复指引：比主说明再低一级，不抢对勾与主按钮的注意力。 */
  notice: {
    marginTop: space.xs,
    color: colors.muted,
    textAlign: 'center',
    ...type.caption,
    fontWeight: weight.regular,
  },
  /** 处理中的取消：浅灰底、右下角的小按钮。 */
  ghost: {
    alignSelf: 'flex-end',
    marginTop: space.xl,
    minHeight: size.controlSm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  ghostText: {
    color: colors.muted,
    ...type.body,
    fontWeight: weight.regular,
  },
  actions: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.xl,
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
    ...type.body,
    fontWeight: weight.regular,
  },
  apply: {
    flex: 1,
    minHeight: size.control,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  applyText: {
    color: colors.white,
    ...type.body,
    fontWeight: weight.bold,
  },
  pressed: {
    opacity: press.opacity,
  },
});
