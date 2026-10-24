import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, elevation, radius, size, space, textScale, type, weight } from '@/theme';

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

      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg, transform: [{ translateY }] }]}>
        <View style={styles.handle} />
        <Text style={styles.title} maxFontSizeMultiplier={textScale.title}>
          确认替换为新的条形码吗？
        </Text>

        <Text maxFontSizeMultiplier={textScale.body} style={styles.label}>旧条形码</Text>
        <View style={styles.codeBox}>
          <Text maxFontSizeMultiplier={textScale.body} selectable={false} style={styles.codeText}>
            {previous}
          </Text>
        </View>

        <View style={styles.arrowWrap}>
          <MaterialCommunityIcons name="arrow-down-bold" size={18} color={colors.green} />
          <Text maxFontSizeMultiplier={textScale.body} style={styles.arrowText}>替换为</Text>
        </View>

        <Text maxFontSizeMultiplier={textScale.body} style={styles.label}>新条形码</Text>
        <View style={[styles.codeBox, styles.codeBoxNew]}>
          <Text maxFontSizeMultiplier={textScale.body} selectable={false} style={[styles.codeText, styles.codeTextNew]}>
            {next}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.cancel} onPress={onCancel}>
            <Text maxFontSizeMultiplier={textScale.body} style={styles.cancelText}>取消</Text>
          </Pressable>
          <Pressable style={styles.confirm} onPress={onConfirm}>
            <Text maxFontSizeMultiplier={textScale.body} style={styles.confirmText}>确认替换</Text>
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
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: space.md,
    paddingHorizontal: space.lg,
    ...elevation.sheet,
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
  label: {
    marginTop: space.lg,
    marginBottom: space.sm,
    color: colors.muted,
    ...type.caption,
    fontWeight: weight.bold,
  },
  codeBox: {
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  codeBoxNew: {
    backgroundColor: colors.greenSoft,
  },
  codeText: {
    color: colors.ink,
    ...type.body,
    fontVariant: ['tabular-nums'],
  },
  codeTextNew: {
    color: colors.greenStrong,
    fontWeight: weight.bold,
  },
  arrowWrap: {
    marginTop: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  arrowText: {
    color: colors.greenStrong,
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
    // 行动一律用主题填充色；绿色只留给「新条码」这类状态标识。
    backgroundColor: colors.teal,
  },
  confirmText: {
    color: colors.white,
    ...type.bodyLg,
    fontWeight: weight.bold,
  },
});
