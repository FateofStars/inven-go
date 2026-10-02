import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from 'react-native';

import { colors, shadow } from '@/theme';

type CenterCardProps = {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: 'teal' | 'danger' | 'green' | 'navy';
  confirmDisabled?: boolean;
  /** 纯选择型弹窗可以只保留一个关闭按钮。 */
  showConfirm?: boolean;
  /** 固定在滚动区之上、不随内容滚动的区块（例如「当前操作数据库」提示条）。 */
  header?: ReactNode;
  /** 位于按钮行下方的补充区块（例如「新建数据库」里可选的预导入入口）。 */
  footer?: ReactNode;
  /** 按钮行与上方内容的间距，默认 22；表单类弹窗可收紧到与内部节奏一致。 */
  actionsSpacing?: number;
  /** 内容超长可滚动时是否显示纵向滚动条；默认隐藏，保持弹窗观感干净。 */
  showScrollIndicator?: boolean;
  /** 卡片最大高度，默认占满可用区域；内容很长时可收紧以避免顶到状态栏。 */
  cardMaxHeight?: DimensionValue;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

export function CenterCard({
  visible,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmTone = 'teal',
  confirmDisabled = false,
  showConfirm = true,
  header,
  footer,
  actionsSpacing = 22,
  showScrollIndicator = false,
  cardMaxHeight = '100%',
  onConfirm,
  onCancel,
  children,
}: CenterCardProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.card, { maxHeight: cardMaxHeight }]}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
          {/* 固定头部：常驻在标题下方，不参与滚动。 */}
          {header ? <View style={styles.headerBlock}>{header}</View> : null}
          {children ? (
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentInner}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={showScrollIndicator}
            >
              {children}
            </ScrollView>
          ) : null}
          <View style={[styles.actions, { marginTop: actionsSpacing }]}>
            <Pressable
              style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
              onPress={showConfirm ? onCancel : onConfirm}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            {showConfirm ? (
              <Pressable
                style={({ pressed }) => [
                  styles.confirm,
                  confirmToneStyle[confirmTone],
                  confirmDisabled && styles.confirmDisabled,
                  pressed && styles.pressed,
                ]}
                onPress={confirmDisabled ? undefined : onConfirm}
                disabled={confirmDisabled}
                accessibilityState={{ disabled: confirmDisabled }}
              >
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              </Pressable>
            ) : null}
          </View>
          {/* 按钮行下方的补充区块：例如「新建数据库」里可选的预导入入口。 */}
          {footer ? <View style={styles.footerBlock}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const confirmToneStyle = {
  teal: { backgroundColor: colors.teal },
  danger: { backgroundColor: colors.danger },
  green: { backgroundColor: colors.green },
  navy: { backgroundColor: colors.navy },
} as const;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 22,
    ...shadow,
  },
  content: {
    flexGrow: 0,
    flexShrink: 1,
  },
  contentInner: {
    /** 首个子元素与说明文字之间、以及各区块之间统一留出 12px 的垂直节奏。 */
    paddingTop: 12,
    paddingBottom: 2,
    gap: 12,
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  headerBlock: {
    marginTop: 12,
  },
  footerBlock: {
    marginTop: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancel: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cancelText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  confirm: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDisabled: {
    opacity: 0.4,
  },
  confirmText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  /** 统一按下反馈：轻微下沉 + 透明淡出。 */
  pressed: {
    opacity: 0.5,
    transform: [{ scale: 0.96 }],
  },
});
