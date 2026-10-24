import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarcodeScanModal } from '@/components/BarcodeScanModal';
import { CenterCard } from '@/components/CenterCard';
import { QuantityStepper } from '@/components/QuantityStepper';
import { ToastBar, type ToastTone } from '@/components/ToastBar';
import { useInventory, type BarcodeOpResult } from '@/context/InventoryContext';
import { formatTimestamp } from '@/lib/format';
import { colors, elevation, press, radius, size, space, state, textScale, type, weight } from '@/theme';

/** 取码弹窗的用途：新增一个条码，或替换某个已有条码。 */
type ScanTarget = { mode: 'add' } | { mode: 'edit'; barcode: string };

/** 未置顶时「置顶」图标取统一的中性灰 token。 */
const PIN_MUTED = colors.pinMuted;

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
  const scrollRef = useRef<ScrollView>(null);
  /** 「手动增减」面板在内容中的纵向位置，键盘弹出时据此把输入框滚进可视区。 */
  const adjustPanelY = useRef(0);
  /** 当前滚动位置，键盘弹出前先记下来，收起时原样退回。 */
  const offsetRef = useRef(0);
  /** 记录键盘弹出前的滚动位置：收起键盘后回到这里，避免页面一直停在被顶上去的位置。 */
  const restoreOffset = useRef(0);
  /** 键盘弹出期间用户是否自己滚动过：滚过就不再强行回位，避免和用户手势打架。 */
  const userScrolled = useRef(false);
  const [amount, setAmount] = useState(1);
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

  /**
   * 键盘弹出会压缩可视高度，这里在键盘出现时主动把「手动增减」面板滚到可视区上方，
   * 保证步进器的输入框不会被键盘挡住；键盘收起后再滚回原来的位置，
   * 让输入框卡片跟着下移复位（页面上只有这一个输入框，触发源明确）。
   */
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => {
      restoreOffset.current = offsetRef.current;
      userScrolled.current = false;
      scrollRef.current?.scrollTo({ y: Math.max(0, adjustPanelY.current - 8), animated: true });
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      // 用户自己滚过就直接停在他看的位置，不再拉回。
      if (userScrolled.current) return;
      scrollRef.current?.scrollTo({ y: restoreOffset.current, animated: true });
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const showToast = (message: string, tone: ToastTone) => setToast({ message, tone });

  if (!product) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingTitle} maxFontSizeMultiplier={textScale.title}>
          未找到该商品
        </Text>
        <Pressable style={styles.primary} onPress={() => router.back()}>
          <Text maxFontSizeMultiplier={textScale.body} style={styles.primaryText}>返回库存</Text>
        </Pressable>
      </View>
    );
  }

  const pinned = product.isPinned === true;
  // 深色 hero 上：图标用浅薄荷（保留「绿色 = 已置顶」的本义），文字用暖白或暖灰。
  const pinIconColor = pinned ? colors.greenSoft : PIN_MUTED;
  const pinLabelColor = pinned ? colors.onInk : colors.onInkMuted;

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
    setPending(false);
    if (!result.ok) {
      showToast(result.message, 'warning');
      return;
    }
    // 增加走标准深绿成功色；减少改用与「取消置顶」一致的蓝色调（白字），方向一眼可辨。
    showToast(`库存已更新为 ${result.product.stock}`, delta < 0 ? 'info' : 'success');
  };

  /** 按步进器里的数量执行一次增减（数量为 0 时拦截，避免提交空变动）。 */
  const applyTyped = (direction: 1 | -1) => {
    if (amount <= 0) {
      showToast('操作数量必须大于 0', 'warning');
      return;
    }
    void apply(direction * amount);
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
      <ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        onScroll={(event) => {
          offsetRef.current = event.nativeEvent.contentOffset.y;
        }}
        onScrollBeginDrag={() => {
          userScrolled.current = true;
        }}
      >
        <View style={styles.hero}>
          <View style={styles.heroHead}>
            <Text style={styles.name} maxFontSizeMultiplier={textScale.title}>
              {product.name}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.pinButton, pressed && styles.pressed]}
              onPress={() => void togglePin()}
              accessibilityLabel={pinned ? '取消置顶' : '置顶该商品'}
              hitSlop={space.sm}
            >
              <View style={styles.pinIconWrap}>
                <MaterialCommunityIcons name="format-vertical-align-top" size={14} color={pinIconColor} />
                {pinned ? null : (
                  <>
                    {/* 先用与卡片同色的粗线留出「间隙」，再叠上灰色斜线，突出覆盖层次。 */}
                    <View style={styles.pinSlashGap} />
                    <View style={styles.pinSlash} />
                  </>
                )}
              </View>
              <Text style={[styles.pinLabel, { color: pinLabelColor }]} maxFontSizeMultiplier={1.2}>
                {pinned ? '已置顶' : '置顶'}
              </Text>
            </Pressable>
          </View>
          <Text maxFontSizeMultiplier={textScale.body} style={styles.stockLabel}>当前库存</Text>
          <Text style={[styles.stock, product.stock === 0 && styles.stockEmpty]} maxFontSizeMultiplier={textScale.number}>
            {product.stock}
          </Text>
          <Text maxFontSizeMultiplier={textScale.body} style={styles.meta}>更新于 {formatTimestamp(product.updatedAt)}</Text>
        </View>

        <View
          style={styles.panel}
          onLayout={(event) => {
            adjustPanelY.current = event.nativeEvent.layout.y;
          }}
        >
          <Text maxFontSizeMultiplier={textScale.body} style={styles.panelTitle}>调整库存</Text>
          {/* 数量与提交合为一组：数量保持 1 时就是原来的快捷 ±1，输入更大数值则一次增减多件。 */}
          <QuantityStepper value={amount} onChange={setAmount} min={0} />
          <View style={styles.quickRow}>
            <Pressable
              style={({ pressed }) => [styles.minus, pending && styles.disabled, pressed && styles.pressed]}
              onPress={() => applyTyped(-1)}
              disabled={pending}
              accessibilityLabel={`减少 ${amount} 件`}
              accessibilityState={{ disabled: pending }}
            >
              <Text maxFontSizeMultiplier={textScale.body} style={styles.minusText}>减少</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.plus, pending && styles.disabled, pressed && styles.pressed]}
              onPress={() => applyTyped(1)}
              disabled={pending}
              accessibilityLabel={`增加 ${amount} 件`}
              accessibilityState={{ disabled: pending }}
            >
              <Text maxFontSizeMultiplier={textScale.body} style={styles.plusText}>增加</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Text maxFontSizeMultiplier={textScale.body} style={styles.panelTitle}>绑定条码</Text>
            <Pressable
              style={({ pressed }) => [styles.addBarcode, pressed && styles.pressed]}
              onPress={() => setScanTarget({ mode: 'add' })}
              accessibilityLabel="新增绑定条码"
              hitSlop={space.sm}
            >
              <MaterialCommunityIcons name="plus" size={16} color={colors.white} />
            </Pressable>
          </View>

          {product.barcodes.length === 0 ? <Text maxFontSizeMultiplier={textScale.body} style={styles.barcodeEmpty}>还没有条码</Text> : null}

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
                      <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.navy} />
                      <Text maxFontSizeMultiplier={textScale.body} style={[styles.actionText, styles.actionTextEdit]}>修改</Text>
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
                        size={20}
                        color={onlyOne ? colors.muted : colors.danger}
                      />
                      <Text maxFontSizeMultiplier={textScale.body} style={[styles.actionText, onlyOne ? styles.actionTextDisabled : styles.actionTextRemove]}>
                        删除
                      </Text>
                    </Pressable>
                  </View>
                )}
              >
                <View style={styles.barcodeRow}>
                  {/* 禁止文本选中，否则安卓长按会弹出蓝色选择框，干扰左滑手势。 */}
                  <Text maxFontSizeMultiplier={textScale.body} selectable={false} style={styles.barcodeText}>
                    {code}
                  </Text>
                </View>
              </Swipeable>
            );
          })}
          <Text maxFontSizeMultiplier={textScale.body} style={styles.barcodeHint}>左滑条码可修改或删除。</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
          onPress={() => setConfirmDelete(true)}
        >
          <Text maxFontSizeMultiplier={textScale.body} style={styles.deleteText}>删除商品</Text>
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

      {/* 底部浮动提示：库存增减与条码相关的新增/修改/删除/防呆反馈全部走这里。 */}
      {toast ? <ToastBar message={toast.message} tone={toast.tone} bottom={insets.bottom + space.xl} /> : null}
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
    padding: space.lg,
    gap: space.lg,
    paddingBottom: space.xxl,
  },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: radius.xl,
    padding: space.xl,
  },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  name: {
    flex: 1,
    color: colors.onInk,
    ...type.display,
    fontWeight: weight.bold,
  },
  /**
   * 置顶按钮：高度与商品名称首行一致，图标槽与文字槽各自定宽居中。
   * 这样「置顶 / 已置顶」的字数变化不会带动图标和边框位置。
   */
  pinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: type.display.lineHeight,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.onInkLine,
  },
  pinIconWrap: {
    width: space.lg,
    height: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinSlashGap: {
    position: 'absolute',
    width: 4,
    height: space.lg,
    borderRadius: 2,
    backgroundColor: colors.ink,
    transform: [{ rotate: '45deg' }],
  },
  pinSlash: {
    position: 'absolute',
    width: 2,
    height: space.lg,
    borderRadius: 1,
    backgroundColor: PIN_MUTED,
    transform: [{ rotate: '45deg' }],
  },
  pinLabel: {
    // 固定文字槽：容纳三个汉字（字号最多放大到 1.2×），两种状态共用同一个宽度。
    width: 44,
    textAlign: 'center',
    ...type.caption,
    fontWeight: weight.bold,
  },
  stockLabel: {
    marginTop: space.xl,
    color: colors.onInkMuted,
    ...type.caption,
    fontWeight: weight.regular,
  },
  stock: {
    // 标签紧贴数字上方，只留一点点行间距离，让「当前库存 + 数字」读成一个整体。
    marginTop: space.xs,
    color: colors.white,
    ...type.numberHero,
    fontWeight: weight.bold,
    fontVariant: ['tabular-nums'],
  },
  stockEmpty: {
    color: colors.onInkDanger,
  },
  meta: {
    marginTop: space.sm,
    color: colors.onInkMuted,
    ...type.caption,
    fontWeight: weight.regular,
    fontVariant: ['tabular-nums'],
  },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    ...elevation.card,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: colors.ink,
    ...type.bodyLg,
    fontWeight: weight.bold,
  },
  /** 绑定条码的「新增」：与二级界面头部按钮共用紧凑行动样式（32 + 16 图标）。 */
  addBarcode: {
    width: size.actionCompact,
    height: size.actionCompact,
    borderRadius: radius.sm,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  minus: {
    flex: 1,
    minHeight: size.control,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.claySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minusText: {
    color: colors.clayStrong,
    ...type.bodyLg,
    fontWeight: weight.bold,
  },
  plus: {
    flex: 1,
    minHeight: size.control,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusText: {
    color: colors.greenStrong,
    ...type.bodyLg,
    fontWeight: weight.bold,
  },
  /** 统一按压反馈。 */
  pressed: {
    opacity: press.opacity,
  },
  /** 请求进行中的禁用态。 */
  disabled: {
    opacity: state.disabled,
  },
  barcodeRow: {
    minHeight: size.control,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  barcodeText: {
    color: colors.ink,
    ...type.body,
    fontVariant: ['tabular-nums'],
  },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.sm,
    backgroundColor: colors.card,
  },
  action: {
    width: size.swipeAction,
    minHeight: size.control,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  actionEdit: {
    backgroundColor: colors.navySoft,
  },
  actionRemove: {
    backgroundColor: colors.dangerSoft,
  },
  actionDisabled: {
    backgroundColor: colors.bg,
  },
  actionText: {
    ...type.caption,
    fontWeight: weight.bold,
  },
  actionTextEdit: {
    color: colors.navyStrong,
  },
  actionTextRemove: {
    color: colors.dangerStrong,
  },
  actionTextDisabled: {
    color: colors.muted,
  },
  barcodeEmpty: {
    color: colors.muted,
    ...type.body,
  },
  barcodeHint: {
    color: colors.muted,
    ...type.caption,
  },
  /** 「删除商品」独立成块，与卡片同级，补一档卡片阴影保持统一。 */
  delete: {
    minHeight: size.control,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
    ...elevation.card,
  },
  deleteText: {
    color: colors.dangerStrong,
    ...type.bodyLg,
    fontWeight: weight.bold,
  },
  missing: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    padding: space.xl,
  },
  missingTitle: {
    color: colors.ink,
    ...type.title,
    fontWeight: weight.bold,
  },
  primary: {
    minHeight: size.control,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: colors.white,
    ...type.bodyLg,
    fontWeight: weight.bold,
  },
});
