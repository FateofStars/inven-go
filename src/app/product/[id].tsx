import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarcodeScanModal } from '@/components/BarcodeScanModal';
import { CenterCard } from '@/components/CenterCard';
import { ToastBar, type ToastTone } from '@/components/ToastBar';
import { useInventory, type BarcodeOpResult } from '@/context/InventoryContext';
import { formatTimestamp, parsePositiveInteger } from '@/lib/format';
import { colors, shadow } from '@/theme';

/** 取码弹窗的用途：新增一个条码，或替换某个已有条码。 */
type ScanTarget = { mode: 'add' } | { mode: 'edit'; barcode: string };

/** 未置顶时「置顶」图标的低饱和中性灰。 */
const PIN_MUTED = '#9CA3AF';

type ToastState = { message: string; tone: ToastTone };

/** 条码操作失败时的中文提示；成功返回 null，由调用方给出成功文案。 */
function barcodeFailure(result: BarcodeOpResult): string | null {
  switch (result.kind) {
    case 'ok':
      return null;
    case 'duplicate':
      return `该条码已属于「${result.owner}」`;
    case 'exists':
      return '该条码已经是这个商品的条码';
    case 'last-barcode':
      return '每个商品至少需保留一个条形码，无法删除';
    case 'not-found':
      return '商品或条码不存在';
    case 'invalid':
      return '请输入有效的条形码';
  }
}

export default function ProductScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const productId = Array.isArray(params.id) ? params.id[0] : params.id;
  const insets = useSafeAreaInsets();
  const { products, adjustStock, deleteProduct, addBarcode, replaceBarcode, removeBarcode, setPinned } =
    useInventory();
  const product = products.find((item) => item.id === productId);
  const [amount, setAmount] = useState('1');
  // notice 只承载「快速调整」卡片自己的反馈，条码相关的提示统一走底部 Toast。
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  // 同一时刻只保留一行处于滑开状态，避免整页都是敞开的操作按钮。
  const openRow = useRef<Swipeable | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = (message: string, tone: ToastTone) => setToast({ message, tone });

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

  const pinned = product.isPinned === true;
  const pinColor = pinned ? colors.green : PIN_MUTED;

  const togglePin = async () => {
    const next = !pinned;
    // 置顶是轻量状态切换，只给一次很短的震动作为确认反馈。
    Vibration.vibrate(next ? 18 : 12);
    await setPinned(product.id, next);
    showToast(next ? '已置顶该商品' : '已取消置顶', next ? 'success' : 'info');
  };

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

  const submitScanned = async (code: string) => {
    const target = scanTarget;
    setScanTarget(null);
    if (!target) return;
    if (target.mode === 'add') {
      const failure = barcodeFailure(await addBarcode(product.id, code));
      showToast(failure ?? `已新增绑定条码 ${code}`, failure ? 'warning' : 'success');
      return;
    }
    const failure = barcodeFailure(await replaceBarcode(product.id, target.barcode, code));
    showToast(failure ?? `条码已更新为 ${code}`, failure ? 'warning' : 'success');
  };

  const removeTargetBarcode = async (code: string) => {
    const failure = barcodeFailure(await removeBarcode(product.id, code));
    // 删除属于破坏性操作，成功也用黄色警示色，比成功绿更贴切。
    showToast(failure ?? `已删除条码 ${code}`, 'warning');
  };

  return (
    <View style={styles.root}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroHead}>
            <Text style={styles.name}>{product.name}</Text>
            <Pressable
              style={({ pressed }) => [styles.pinButton, pressed && styles.pressed]}
              onPress={() => void togglePin()}
              accessibilityLabel={pinned ? '取消置顶' : '置顶该商品'}
            >
              <View style={styles.pinIconWrap}>
                <MaterialCommunityIcons name="format-vertical-align-top" size={22} color={pinColor} />
                {pinned ? null : (
                  <>
                    {/* 先用与卡片同色的粗线留出「间隙」，再叠上灰色斜线，突出覆盖层次。 */}
                    <View style={styles.pinSlashGap} />
                    <View style={styles.pinSlash} />
                  </>
                )}
              </View>
              <Text style={[styles.pinLabel, { color: pinColor }]}>{pinned ? '已置顶' : '置顶'}</Text>
            </Pressable>
          </View>
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
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>绑定条码</Text>
            <Pressable
              style={({ pressed }) => [styles.addBarcode, pressed && styles.pressed]}
              onPress={() => setScanTarget({ mode: 'add' })}
              accessibilityLabel="新增绑定条码"
            >
              <MaterialCommunityIcons name="plus" size={20} color={colors.white} />
            </Pressable>
          </View>

          {product.barcodes.length === 0 ? <Text style={styles.barcodeEmpty}>还没有条码</Text> : null}

          {product.barcodes.map((code) => {
            // 防呆：商品必须至少保留一个条码，只剩一个时删除按钮变灰并给出说明。
            const onlyOne = product.barcodes.length <= 1;
            return (
              <Swipeable
                key={code}
                onSwipeableOpen={(_direction, swipeable) => {
                  if (openRow.current && openRow.current !== swipeable) openRow.current.close();
                  openRow.current = swipeable;
                }}
                renderRightActions={(_progress, _dragX, swipeable) => (
                  <View style={styles.swipeActions}>
                    <Pressable
                      style={({ pressed }) => [styles.action, styles.actionEdit, pressed && styles.pressed]}
                      onPress={() => {
                        swipeable.close();
                        setScanTarget({ mode: 'edit', barcode: code });
                      }}
                      accessibilityLabel={`修改条码 ${code}`}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={19} color={colors.navy} />
                      <Text style={[styles.actionText, styles.actionTextEdit]}>修改</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.action,
                        onlyOne ? styles.actionDisabled : styles.actionRemove,
                        pressed && styles.pressed,
                      ]}
                      accessibilityLabel={`删除条码 ${code}`}
                      accessibilityState={{ disabled: onlyOne }}
                      onPress={() => {
                        swipeable.close();
                        if (onlyOne) {
                          showToast('每个商品至少需保留一个条形码，无法删除', 'warning');
                          return;
                        }
                        setConfirmRemove(code);
                      }}
                    >
                      <MaterialCommunityIcons
                        name="trash-can-outline"
                        size={19}
                        color={onlyOne ? colors.muted : colors.danger}
                      />
                      <Text style={[styles.actionText, onlyOne ? styles.actionTextDisabled : styles.actionTextRemove]}>
                        删除
                      </Text>
                    </Pressable>
                  </View>
                )}
              >
                <View style={styles.barcodeRow}>
                  {/* 禁止文本选中，否则安卓长按会弹出蓝色选择框，干扰左滑手势。 */}
                  <Text selectable={false} style={styles.barcodeText}>
                    {code}
                  </Text>
                </View>
              </Swipeable>
            );
          })}
          <Text style={styles.barcodeHint}>左滑条码可修改或删除。</Text>
        </View>

        <Pressable style={styles.delete} onPress={() => setConfirmDelete(true)}>
          <Text style={styles.deleteText}>删除商品</Text>
        </Pressable>

        {scanTarget ? (
          <BarcodeScanModal
            title={scanTarget.mode === 'add' ? '新增绑定条码' : '修改条码'}
            hint={
              scanTarget.mode === 'add'
                ? `扫描或输入要绑定到「${product.name}」的新条码`
                : `扫描或输入替换 ${scanTarget.barcode} 的新条码`
            }
            replaceFrom={scanTarget.mode === 'edit' ? scanTarget.barcode : undefined}
            onCancel={() => setScanTarget(null)}
            onSubmit={(code) => void submitScanned(code)}
          />
        ) : null}

        <CenterCard
          visible={confirmRemove !== null}
          title="确定要删除该条形码吗？"
          description={`删除后「${product.name}」将不再识别条码 ${confirmRemove ?? ''}，该操作会写入条码更新日志。`}
          confirmLabel="确认删除"
          confirmTone="danger"
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => {
            const code = confirmRemove;
            setConfirmRemove(null);
            if (code) void removeTargetBarcode(code);
          }}
        />

        <CenterCard
          visible={confirmDelete}
          title="删除这个商品？"
          description={`「${product.name}」及其条码会从库存中移除，并写入删除日志。`}
          confirmLabel="确认删除"
          confirmTone="danger"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void deleteProduct(product.id).then(() => router.back());
          }}
        />
      </ScrollView>

      {/* 底部浮动提示：条码相关的新增/修改/删除/防呆反馈全部走这里。 */}
      {toast ? <ToastBar message={toast.message} tone={toast.tone} bottom={insets.bottom + 24} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
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
  heroHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  name: {
    flex: 1,
    color: colors.white,
    fontSize: 24,
    fontWeight: '800',
  },
  pinButton: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    minWidth: 48,
  },
  pinIconWrap: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinSlashGap: {
    position: 'absolute',
    width: 5,
    height: 26,
    borderRadius: 3,
    backgroundColor: colors.ink,
    transform: [{ rotate: '45deg' }],
  },
  pinSlash: {
    position: 'absolute',
    width: 2,
    height: 26,
    borderRadius: 1,
    backgroundColor: PIN_MUTED,
    transform: [{ rotate: '45deg' }],
  },
  pinLabel: {
    fontSize: 11,
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
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  addBarcode: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
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
  barcodeRow: {
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  barcodeText: {
    color: colors.ink,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
    backgroundColor: colors.card,
  },
  action: {
    width: 68,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionEdit: {
    backgroundColor: colors.navySoft,
    borderWidth: 1,
    borderColor: colors.navy,
  },
  actionRemove: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  actionDisabled: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  actionTextEdit: {
    color: colors.navy,
  },
  actionTextRemove: {
    color: colors.danger,
  },
  actionTextDisabled: {
    color: colors.muted,
  },
  barcodeEmpty: {
    color: colors.muted,
  },
  barcodeHint: {
    color: colors.muted,
    fontSize: 12,
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
