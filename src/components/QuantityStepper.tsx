import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { parseQuantityInput } from '@/lib/format';
import { colors, press, radius, size, space, textScale, type, weight } from '@/theme';

type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  /** 步进下限，默认 0：允许删空或减到 0，由调用方在提交时拦截 0 变动。 */
  min?: number;
  max?: number;
};

/**
 * 数量步进器：两侧减/加，中间可直接输入。
 * 输入框完全受控于 `value`，但删空时按 0 处理（不再强行回填 1），
 * 这样退格清空后接着输入目标数字不会被拼成「150」；输入过程中产生的前导 0 也会归一化（05 → 5）。
 */
export function QuantityStepper({ value, onChange, min = 0, max = 99999 }: QuantityStepperProps) {
  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) onChange(next);
  };

  const handleText = (raw: string) => {
    // 删空：回填 0，让输入框保持可继续编辑，不打断后续数字的输入。
    if (raw.trim() === '') {
      if (value !== 0) onChange(0);
      return;
    }
    const parsed = parseQuantityInput(raw);
    if (parsed === null) return;
    // 0 是删空后的临时态，允许停留；其余数值仍按 [min, max] 收敛。
    const next = parsed === 0 ? 0 : Math.min(max, Math.max(min, parsed));
    if (next !== value) onChange(next);
  };

  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View style={styles.row}>
      <Pressable
        style={({ pressed }) => [styles.step, pressed && !atMin && styles.pressed]}
        onPress={() => step(-1)}
        disabled={atMin}
        accessibilityLabel="减少数量"
        accessibilityState={{ disabled: atMin }}
      >
        <MaterialCommunityIcons name="minus" size={20} color={atMin ? colors.muted : colors.clayStrong} />
      </Pressable>
      <TextInput
        value={String(value)}
        onChangeText={handleText}
        keyboardType="number-pad"
        selectTextOnFocus
        style={styles.input}
        maxFontSizeMultiplier={textScale.title}
        accessibilityLabel="数量"
      />
      <Pressable
        style={({ pressed }) => [styles.step, pressed && !atMax && styles.pressed]}
        onPress={() => step(1)}
        disabled={atMax}
        accessibilityLabel="增加数量"
        accessibilityState={{ disabled: atMax }}
      >
        <MaterialCommunityIcons name="plus" size={20} color={atMax ? colors.muted : colors.greenStrong} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  step: {
    width: size.control,
    height: size.control,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  pressed: {
    opacity: press.opacity,
  },
  input: {
    flex: 1,
    minHeight: size.control,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    paddingHorizontal: space.md,
    color: colors.ink,
    ...type.title,
    fontWeight: weight.bold,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
