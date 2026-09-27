import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, shadow } from '@/theme';

type BarcodeReplaceSheetProps = {
  previous: string;
  next: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * 替换条码前的新旧对比面板。
 * 刻意不用 Modal：它作为浮层覆盖在**扫码页内部**，取消后扫码页原样保留，
 * 用户可以直接对准正确的条码重扫，不需要退出再进入。
 */
export function BarcodeReplaceSheet({ previous, next, onCancel, onConfirm }: BarcodeReplaceSheetProps) {
  const insets = useSafeAreaInsets();
  // 放在惰性 state 而不是 useRef：React Compiler 不允许在渲染期读取 ref.current。
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [420, 0] });

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.scrim, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="取消替换" />
      </Animated.View>

      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 18, transform: [{ translateY }] }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>确认替换为新的条形码吗？</Text>

        <Text style={styles.label}>旧条形码</Text>
        <View style={styles.codeBox}>
          <Text selectable={false} style={styles.codeText}>
            {previous}
          </Text>
        </View>

        <View style={styles.arrowWrap}>
          <MaterialCommunityIcons name="arrow-down-bold" size={18} color={colors.green} />
          <Text style={styles.arrowText}>替换为</Text>
        </View>

        <Text style={styles.label}>新条形码</Text>
        <View style={[styles.codeBox, styles.codeBoxNew]}>
          <Text selectable={false} style={[styles.codeText, styles.codeTextNew]}>
            {next}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.cancel} onPress={onCancel}>
            <Text style={styles.cancelText}>取消</Text>
          </Pressable>
          <Pressable style={styles.confirm} onPress={onConfirm}>
            <Text style={styles.confirmText}>确认替换</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 18,
    ...shadow,
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
    fontSize: 20,
    fontWeight: '800',
  },
  label: {
    marginTop: 16,
    marginBottom: 8,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  codeBox: {
    borderRadius: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  codeBoxNew: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.green,
  },
  codeText: {
    color: colors.ink,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  codeTextNew: {
    color: colors.green,
    fontWeight: '800',
  },
  arrowWrap: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  arrowText: {
    color: colors.green,
    fontSize: 13,
    fontWeight: '800',
  },
  actions: {
    marginTop: 22,
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
    backgroundColor: colors.green,
  },
  confirmText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
});
