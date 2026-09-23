import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { CenterCard } from '@/components/CenterCard';
import { useInventory } from '@/context/InventoryContext';
import { formatTimestamp, parsePositiveInteger } from '@/lib/format';
import { colors, shadow } from '@/theme';

export default function ProductScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const productId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { products, adjustStock, deleteProduct } = useInventory();
  const product = products.find((item) => item.id === productId);
  const [amount, setAmount] = useState('1');
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);

  if (!product) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingTitle}>未找到该商品</Text>
        <Pressable style={styles.primary} onPress={() => router.back()}>
          <Text style={styles.primaryText}>返回库存</Text>
        </Pressable>
      </View>
    );
  }

  const apply = async (delta: number) => {
    if (pending) return;
    setPending(true);
    const result = await adjustStock(product.id, delta);
    setNotice(result.ok ? `库存已更新为 ${result.product.stock}` : result.message);
    setPending(false);
  };

  const applyTyped = (direction: 1 | -1) => {
    const value = parsePositiveInteger(amount);
    if (value === null) {
      setNotice('请输入大于 0 的整数');
      return;
    }
    void apply(direction * value);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.name}>{product.name}</Text>
        <Text style={[styles.stock, product.stock === 0 && styles.stockEmpty]}>{product.stock}</Text>
        <Text style={styles.stockLabel}>当前库存</Text>
        <Text style={styles.meta}>更新于 {formatTimestamp(product.updatedAt)}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>快速调整</Text>
        <View style={styles.quickRow}>
          <Pressable
            style={({ pressed }) => [styles.minus, pressed && styles.pressed]}
            onPress={() => void apply(-1)}
            disabled={pending}
          >
            <Text style={styles.minusText}>-1</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.plus, pressed && styles.pressed]}
            onPress={() => void apply(1)}
            disabled={pending}
          >
            <Text style={styles.plusText}>+1</Text>
          </Pressable>
        </View>
        <Text style={styles.panelTitle}>手动增减</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          placeholder="输入数量"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <View style={styles.quickRow}>
          <Pressable
            style={({ pressed }) => [styles.minus, pressed && styles.pressed]}
            onPress={() => applyTyped(-1)}
            disabled={pending}
          >
            <Text style={styles.minusText}>减少</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.plus, pressed && styles.pressed]}
            onPress={() => applyTyped(1)}
            disabled={pending}
          >
            <Text style={styles.plusText}>增加</Text>
          </Pressable>
        </View>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>绑定条码</Text>
        {product.barcodes.length === 0 ? <Text style={styles.barcodeEmpty}>还没有条码</Text> : null}
        {product.barcodes.map((code) => (
          <Text key={code} selectable style={styles.barcode}>
            {code}
          </Text>
        ))}
      </View>

      <Pressable style={styles.delete} onPress={() => setConfirmDelete(true)}>
        <Text style={styles.deleteText}>删除商品</Text>
      </Pressable>

      <CenterCard
        visible={confirmDelete}
        title="删除这个商品？"
        description={`「${product.name}」及其条码会从库存中移除，并写入删除日志。`}
        confirmLabel="删除"
        confirmTone="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteProduct(product.id).then(() => router.back());
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 32,
  },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: 24,
    padding: 20,
  },
  name: {
    color: colors.white,
    fontSize: 24,
    fontWeight: '800',
  },
  stock: {
    marginTop: 12,
    color: '#F2C14E',
    fontSize: 56,
    fontWeight: '800',
  },
  stockEmpty: {
    color: '#F0A097',
  },
  stockLabel: {
    color: '#D9CBB8',
    fontSize: 13,
  },
  meta: {
    marginTop: 10,
    color: '#C8BEB0',
    fontSize: 12,
  },
  panel: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
    ...shadow,
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  minus: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.claySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minusText: {
    color: colors.clay,
    fontSize: 18,
    fontWeight: '800',
  },
  plus: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusText: {
    color: colors.green,
    fontSize: 18,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.75,
  },
  input: {
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  notice: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '600',
  },
  barcode: {
    color: colors.ink,
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  barcodeEmpty: {
    color: colors.muted,
  },
  delete: {
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  deleteText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '800',
  },
  missing: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  missingTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  primary: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: colors.white,
    fontWeight: '800',
  },
});
