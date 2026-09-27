import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { parsePositiveInteger } from '@/lib/format';
import { colors } from '@/theme';

type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
};

/**
 * 数量步进器：两侧减/加，中间可直接输入。
 * 输入框完全受控于 `value`，非法输入（清空、0、非数字）直接忽略，
 * 因此父级任何时刻拿到的都是合法数量；配合 selectTextOnFocus，重输即覆盖。
 */
export function QuantityStepper({ value, onChange, min = 1, max = 99999 }: QuantityStepperProps) {
  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) onChange(next);
  };

  const handleText = (raw: string) => {
    const parsed = parsePositiveInteger(raw);
    if (parsed === null) return;
    const next = Math.min(max, Math.max(min, parsed));
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
        <MaterialCommunityIcons name="minus" size={20} color={atMin ? colors.muted : colors.clay} />
      </Pressable>
      <TextInput
        value={String(value)}
        onChangeText={handleText}
        keyboardType="number-pad"
        selectTextOnFocus
        style={styles.input}
        accessibilityLabel="数量"
      />
      <Pressable
        style={({ pressed }) => [styles.step, pressed && !atMax && styles.pressed]}
        onPress={() => step(1)}
        disabled={atMax}
        accessibilityLabel="增加数量"
        accessibilityState={{ disabled: atMax }}
      >
        <MaterialCommunityIcons name="plus" size={20} color={atMax ? colors.muted : colors.green} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  step: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: {
    opacity: 0.7,
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
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
});
