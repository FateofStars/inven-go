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
} from 'react-native';

import { colors, shadow } from '@/theme';

type CenterCardProps = {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: 'teal' | 'danger';
  confirmDisabled?: boolean;
  /** 纯选择型弹窗可以只保留一个关闭按钮。 */
  showConfirm?: boolean;
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
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
          {children ? (
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentInner}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : null}
          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={showConfirm ? onCancel : onConfirm}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            {showConfirm ? (
              <Pressable
                style={[
                  styles.confirm,
                  confirmTone === 'danger' ? styles.confirmDanger : styles.confirmTeal,
                  confirmDisabled && styles.confirmDisabled,
                ]}
                onPress={confirmDisabled ? undefined : onConfirm}
                disabled={confirmDisabled}
                accessibilityState={{ disabled: confirmDisabled }}
              >
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

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
    maxHeight: '100%',
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
    paddingBottom: 2,
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
  actions: {
    marginTop: 22,
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
  confirmTeal: {
    backgroundColor: colors.teal,
  },
  confirmDanger: {
    backgroundColor: colors.danger,
  },
  confirmDisabled: {
    opacity: 0.4,
  },
  confirmText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
