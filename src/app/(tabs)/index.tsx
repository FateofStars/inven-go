import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  Vibration,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ToastBar, type ToastTone } from '@/components/ToastBar';
import { useInventory } from '@/context/InventoryContext';
import type { Product } from '@/lib/types';
import { colors, elevation, press, radius, size, space, textScale, type, weight } from '@/theme';

/**
 * 首页三个扫描入口各自保留一种识别色，颜色只出现在图标底块与标签上。
 * `text` 是浅底专用的深档字色，保证 12px 标签仍有 4.5:1 对比度。
 */
const actions = [
  { mode: 'inbound', label: '入库扫描', icon: 'tray-arrow-down', color: colors.teal, text: colors.tealStrong, soft: colors.tealSoft },
  { mode: 'outbound', label: '出库扫描', icon: 'tray-arrow-up', color: colors.clay, text: colors.clayStrong, soft: colors.claySoft },
  { mode: 'query', label: '库存查询', icon: 'barcode-scan', color: colors.navy, text: colors.navyStrong, soft: colors.navySoft },
] as const;

/** 底部浮动操作条的预估高度（首帧用），真实高度由 onLayout 量出来。 */
const ACTION_BAR_HEIGHT = 78;
/** 悬浮操作条 / Toast 与相邻元素之间的统一留白，三者的等距呼吸感依赖它。 */
const ACTION_BAR_GAP = space.lg;

/** 长按进入拖拽排序所需的按压时长。 */
const LONG_PRESS_MS = 500;
/** 卡片间距：与 styles.row 的 gap / marginBottom 保持一致，拖拽几何计算依赖它。 */
const CARD_GAP = space.md;
/** 列表左右内边距：与 styles.list 的 paddingHorizontal 保持一致。 */
const LIST_PADDING = space.lg;
/** 卡片高度量不出来时的兜底值，只为让几何计算不至于失效。 */
const FALLBACK_CARD_HEIGHT = 160;

type ToastState = { message: string; tone: ToastTone };

/** 拖拽过程中的几何与顺序快照，放在 ref 里避免每帧 setState。 */
type DragState = {
  id: string;
  /** 长按落点相对卡片左上角的偏移，保证悬浮卡不「跳」到手指下。 */
  grab: { x: number; y: number };
  /** 由被按下的卡片位置反推出的置顶网格左上角（屏幕坐标），无需额外测量接口。 */
  grid: { x: number; y: number };
  /** 置顶区域的实时预览顺序，松手时据此落盘。 */
  order: string[];
};

/** 置顶商品按 pinOrder 升序；缺失 pinOrder 的兜底排到最后。 */
function comparePinned(a: Product, b: Product): number {
  const left = a.pinOrder ?? Number.MAX_SAFE_INTEGER;
  const right = b.pinOrder ?? Number.MAX_SAFE_INTEGER;
  return left - right || a.name.localeCompare(b.name, 'zh');
}

/** 把 id 从 order 中摘出并插到 index 位置。 */
function moveTo(order: string[], id: string, index: number): string[] {
  const from = order.indexOf(id);
  if (from < 0 || from === index) return order;
  const next = order.slice();
  next.splice(from, 1);
  next.splice(Math.min(index, next.length), 0, id);
  return next;
}

/** 震动只是锦上添花，任何异常都不该影响拖拽主流程。 */
function tapHaptic(duration: number) {
  try {
    Vibration.vibrate(duration);
  } catch {
    // 设备未授权 VIBRATE 时静默忽略
  }
}

export default function InventoryScreen() {
  const { products, reorderPinned } = useInventory();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const [actionBarHeight, setActionBarHeight] = useState(ACTION_BAR_HEIGHT);
  // 取整避免两列宽度之和与容器差出亚像素，导致 flexWrap 意外换行。
  const cardWidth = Math.floor((width - LIST_PADDING * 2 - CARD_GAP) / 2);

  const rootRef = useRef<View>(null);
  const listRef = useRef<FlatList<Product>>(null);
  const dragRef = useRef<DragState | null>(null);
  const targetRef = useRef(0);
  const cellHeightRef = useRef(0);
  const rootOriginRef = useRef({ x: 0, y: 0 });
  /** 本次按压是否已经进入过长按拖拽，用于抑制松手后的误跳转。 */
  const armedRef = useRef(false);
  /** 根容器是否已接管本次拖拽的触摸（接管后抬手由 PanResponder 收尾）。 */
  const capturedRef = useRef(false);
  const dragPos = useMemo(() => new Animated.ValueXY(), []);
  const lift = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  // 离开本 Tab 时收起搜索框并清空关键词，用户切回时直接是默认的全量列表视图。
  useFocusEffect(
    useCallback(() => {
      return () => {
        setSearchOpen(false);
        setQuery('');
      };
    }, []),
  );

  const keyword = query.trim().toLowerCase();

  const matched = useMemo(
    () => (keyword ? products.filter((product) => product.name.toLowerCase().includes(keyword)) : products),
    [products, keyword],
  );

  const pinnedProducts = useMemo(() => matched.filter((product) => product.isPinned).sort(comparePinned), [matched]);

  const unpinnedProducts = useMemo(
    () =>
      matched
        .filter((product) => !product.isPinned)
        .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, 'zh')),
    [matched],
  );

  const overlayProduct = useMemo(
    () => (draggingId ? products.find((product) => product.id === draggingId) ?? null : null),
    [products, draggingId],
  );

  /**
   * 置顶区域按预览顺序排列（拖拽时用 previewOrder，否则用自然顺序）。
   * 置顶区放在列表头而不是列表数据里：FlatList 的多列行 key 由该行商品拼成，
   * 一旦数据重排整行会被卸载重建，正在进行的拖拽会当场失效。
   */
  const pinnedOrdered = useMemo(() => {
    if (!previewOrder) return pinnedProducts;
    return previewOrder
      .map((id) => pinnedProducts.find((product) => product.id === id))
      .filter((product): product is Product => product !== undefined);
  }, [pinnedProducts, previewOrder]);

  const pinnedCount = pinnedOrdered.length;
  const totalStock = products.reduce((sum, product) => sum + product.stock, 0);

  /** 根容器在屏幕中的原点，用于把屏幕坐标换算成覆盖层坐标。 */
  const measureRoot = useCallback((event: LayoutChangeEvent) => {
    if (event.nativeEvent.layout.width === 0) return;
    rootRef.current?.measureInWindow((x, y) => {
      rootOriginRef.current = { x, y };
    });
  }, []);

  /**
   * 由置顶区整体高度反推单张卡片高度：
   * 高度 = 行数 × 卡片高 + (行数 - 1) × 间距，因此间距 = 卡片高 + CARD_GAP。
   * 这样无需依赖任何单卡测量接口，杜绝「量不到高度就拖不动」的隐患。
   */
  const handlePinnedLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const rows = Math.max(1, Math.ceil(pinnedCount / 2));
      const pitch = (event.nativeEvent.layout.height + CARD_GAP) / rows;
      const cardHeight = pitch - CARD_GAP;
      if (cardHeight > 0) cellHeightRef.current = cardHeight;
    },
    [pinnedCount],
  );

  const notifyPinRequired = () => {
    setToast({ message: '请将卡片置顶后再拖动', tone: 'warning' });
  };

  /** 点标题平滑回到列表顶部。 */
  const scrollToTop = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  /** 长按 0.5 秒后进入拖拽模式：全部逻辑跑在 JS 线程，不存在跨线程崩溃风险。 */
  const beginDrag = useCallback(
    (id: string, event: GestureResponderEvent) => {
      // 搜索态下可见顺序与实际 pinOrder 不对应，直接不允许拖动，避免把顺序写乱。
      if (keyword) return;
      const startIndex = pinnedProducts.findIndex((product) => product.id === id);
      if (startIndex < 0) return;
      const { pageX, pageY, locationX, locationY } = event.nativeEvent;
      const colPitch = cardWidth + CARD_GAP;
      const rowPitch = (cellHeightRef.current || FALLBACK_CARD_HEIGHT) + CARD_GAP;
      const startCol = startIndex % 2;
      const startRow = Math.floor(startIndex / 2);
      const cardLeft = pageX - locationX;
      const cardTop = pageY - locationY;
      dragRef.current = {
        id,
        grab: { x: locationX, y: locationY },
        grid: { x: cardLeft - startCol * colPitch, y: cardTop - startRow * rowPitch },
        order: pinnedProducts.map((product) => product.id),
      };
      capturedRef.current = false;
      targetRef.current = startIndex;
      setDraggingId(id);
      // 起手顺序与自然顺序一致，先不设预览；只有落点变化时才切到预览顺序。
      setPreviewOrder(null);
      dragPos.setValue({ x: cardLeft - rootOriginRef.current.x, y: cardTop - rootOriginRef.current.y });
      lift.setValue(0);
      tapHaptic(18);
      Animated.timing(lift, { toValue: 1, duration: 140, useNativeDriver: false }).start();
    },
    [cardWidth, dragPos, keyword, lift, pinnedProducts],
  );

  const moveDrag = useCallback(
    (pageX: number, pageY: number) => {
      const state = dragRef.current;
      if (!state) return;
      dragPos.setValue({
        x: pageX - state.grab.x - rootOriginRef.current.x,
        y: pageY - state.grab.y - rootOriginRef.current.y,
      });
      const colPitch = cardWidth + CARD_GAP;
      const rowPitch = (cellHeightRef.current || FALLBACK_CARD_HEIGHT) + CARD_GAP;
      const count = pinnedProducts.length;
      const lastRow = Math.floor((count - 1) / 2);
      // 行号夹到最后一行、列号仍按左右判定：拖出置顶区会兜底到最后一行的同侧槽位。
      const col = Math.min(Math.max(Math.floor((pageX - state.grid.x) / colPitch), 0), 1);
      const row = Math.min(Math.max(Math.floor((pageY - state.grid.y) / rowPitch), 0), lastRow);
      const index = Math.min(row * 2 + col, count - 1);
      if (index === targetRef.current) return;
      targetRef.current = index;
      const next = moveTo(state.order, state.id, index);
      if (next === state.order) return;
      state.order = next;
      // 让置顶区域内的其余卡片平滑避让到新位置。
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPreviewOrder(next);
    },
    [cardWidth, dragPos, pinnedProducts.length],
  );

  const endDrag = useCallback(() => {
    const state = dragRef.current;
    if (!state) return;
    dragRef.current = null;
    capturedRef.current = false;
    const colPitch = cardWidth + CARD_GAP;
    const rowPitch = (cellHeightRef.current || FALLBACK_CARD_HEIGHT) + CARD_GAP;
    const index = Math.min(targetRef.current, Math.max(0, pinnedProducts.length - 1));
    const drop = {
      x: state.grid.x + (index % 2) * colPitch,
      y: state.grid.y + Math.floor(index / 2) * rowPitch,
    };
    // 落位动画期间不解除占位态：底层卡片全程保持隐藏（内容 opacity 0），
    // 否则松手瞬间槽位里会提前冒出一张实体卡片，与空中的悬浮卡形成「克隆卡」重叠。
    Animated.parallel([
      Animated.timing(dragPos.x, {
        toValue: drop.x - rootOriginRef.current.x,
        duration: 160,
        useNativeDriver: false,
      }),
      Animated.timing(dragPos.y, {
        toValue: drop.y - rootOriginRef.current.y,
        duration: 160,
        useNativeDriver: false,
      }),
    ]).start(() => {
      // 动画走完才做状态交接：同一帧内撤掉占位槽与悬浮层，
      // 此时悬浮卡已与目标槽位完全重合，底层真实卡片就地显形，视觉无缝衔接。
      // 这里不按 finished 分支跳过收尾——被中断（如立刻开始下一次拖拽）也必须清干净，
      // 否则悬浮层会永久残留。
      setDraggingId(null);
      lift.setValue(0);
      // 等置顶顺序真正写进商品数据后再撤掉预览顺序，
      // 否则撤下的瞬间会先回退到旧顺序、再跳到新顺序，肉眼能看到一次顺序回跳。
      void reorderPinned(state.order).finally(() => setPreviewOrder(null));
    });
  }, [cardWidth, dragPos, lift, pinnedProducts.length, reorderPinned]);

  const handleCardPressIn = useCallback(() => {
    armedRef.current = false;
  }, []);

  const handlePinnedLongPress = useCallback(
    (id: string, event: GestureResponderEvent) => {
      armedRef.current = true;
      beginDrag(id, event);
    },
    [beginDrag],
  );

  const handleCardPress = useCallback((id: string) => {
    // 长按进入拖拽后再松手，不应被当成一次「进入商品详情」的点击。
    if (armedRef.current) return;
    router.push(`/product/${id}`);
  }, []);

  const handlePinnedPressOut = useCallback(() => {
    // 长按后原地松手（根容器没接管过触摸）时，在这里让卡片原地落回。
    if (dragRef.current && !capturedRef.current) endDrag();
  }, [endDrag]);

  /**
   * 拖拽期间由根容器接管触摸：手指一移动就抢占 responder，
   * 之后 pageX / pageY 就是屏幕绝对坐标，既保证跟手，也顺带停掉了列表滚动。
   */
  const shouldCaptureDrag = useCallback(() => {
    if (!dragRef.current) return false;
    capturedRef.current = true;
    return true;
  }, []);

  const handleResponderMove = useCallback(
    (event: GestureResponderEvent) => moveDrag(event.nativeEvent.pageX, event.nativeEvent.pageY),
    [moveDrag],
  );

  const handleResponderEnd = useCallback(() => endDrag(), [endDrag]);

  const closeSearch = () => {
    setQuery('');
    setSearchOpen(false);
  };

  /** 置顶卡片按同一顺序渲染：重排时 React 只会移动节点，卡片不会重建。 */
  const listHeader =
    pinnedCount > 0 ? (
      <View style={styles.pinnedGrid} onLayout={handlePinnedLayout}>
        {pinnedOrdered.map((product) => (
          <PinnedCard
            key={product.id}
            product={product}
            width={cardWidth}
            dragging={product.id === draggingId}
            onPress={handleCardPress}
            onPressIn={handleCardPressIn}
            onLongPress={handlePinnedLongPress}
            onPressOut={handlePinnedPressOut}
          />
        ))}
      </View>
    ) : null;

  return (
    <View
      ref={rootRef}
      style={styles.screen}
      onLayout={measureRoot}
      collapsable={false}
      onMoveShouldSetResponderCapture={shouldCaptureDrag}
      onResponderMove={handleResponderMove}
      onResponderRelease={handleResponderEnd}
      onResponderTerminate={handleResponderEnd}
      onResponderTerminationRequest={() => false}
    >
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        {searchOpen ? (
          <>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="输入商品名称搜索"
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                maxFontSizeMultiplier={textScale.body}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length > 0 ? (
                <Pressable
                  style={styles.searchClear}
                  onPress={() => setQuery('')}
                  accessibilityLabel="清空搜索"
                >
                  <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            <Pressable style={styles.cancel} onPress={closeSearch} hitSlop={space.md}>
              <Text maxFontSizeMultiplier={textScale.body} style={styles.cancelText}>取消</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.titleWrap}>
              {/* 热区只包住左边的标题文字，右侧搜索按钮保持独立可点。 */}
              <Pressable
                style={({ pressed }) => [styles.titleTap, pressed && styles.pressed]}
                onPress={scrollToTop}
                accessibilityLabel="回到顶部"
              >
                <Text style={styles.title} maxFontSizeMultiplier={textScale.title}>
                  Inven Go
                </Text>
                <Text maxFontSizeMultiplier={textScale.body} style={styles.subtitle}>
                  {products.length} 种商品 · 共 {totalStock} 件
                </Text>
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
              onPress={() => setSearchOpen(true)}
              accessibilityLabel="搜索商品"
            >
              <MaterialCommunityIcons name="magnify" size={22} color={colors.ink} />
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.listWrap}>
        <FlatList
          ref={listRef}
          data={unpinnedProducts}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: actionBarHeight + ACTION_BAR_GAP * 2 + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={draggingId === null}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            pinnedCount > 0 ? null : products.length === 0 ? (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="package-variant" size={size.emptyIcon} color={colors.muted} />
                <Text style={styles.emptyTitle} maxFontSizeMultiplier={textScale.title}>
                  仓库还是空的
                </Text>
                <Text maxFontSizeMultiplier={textScale.body} style={styles.emptyText}>点击下方「入库扫描」，扫到新条码后即可创建商品。</Text>
              </View>
            ) : (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="magnify-close" size={size.emptyIcon} color={colors.muted} />
                <Text style={styles.emptyTitle} maxFontSizeMultiplier={textScale.title}>
                  没有匹配的商品
                </Text>
                <Text maxFontSizeMultiplier={textScale.body} style={styles.emptyText}>没有名称包含「{query.trim()}」的商品，换个关键词试试。</Text>
                <Pressable style={styles.emptyAction} onPress={() => setQuery('')}>
                  <Text maxFontSizeMultiplier={textScale.body} style={styles.emptyActionText}>清空搜索</Text>
                </Pressable>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, { width: cardWidth }, pressed && styles.pressed]}
              onPress={() => router.push(`/product/${item.id}`)}
              onLongPress={notifyPinRequired}
              delayLongPress={LONG_PRESS_MS}
            >
              <CardBody product={item} pinned={false} />
            </Pressable>
          )}
        />
      </View>

      <View style={[styles.actionBarWrap, { bottom: ACTION_BAR_GAP }]} pointerEvents="box-none">
        <View
          style={styles.actionBar}
          onLayout={(event) => {
            const next = event.nativeEvent.layout.height;
            if (next > 0) setActionBarHeight(next);
          }}
        >
          {actions.map((action, index) => (
            <Fragment key={action.mode}>
              {index > 0 ? <View style={styles.actionDivider} /> : null}
              <Pressable
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                onPress={() => router.push(`/scan/${action.mode}`)}
                accessibilityLabel={action.label}
              >
                <View style={[styles.actionIcon, { backgroundColor: action.soft }]}>
                  <MaterialCommunityIcons name={action.icon} size={22} color={action.color} />
                </View>
                <Text maxFontSizeMultiplier={textScale.body} style={[styles.actionLabel, { color: action.text }]}>{action.label}</Text>
              </Pressable>
            </Fragment>
          ))}
        </View>
      </View>

      {/* Toast 与功能卡片、功能卡片与底部导航栏保持同一个 GAP，形成等距呼吸感。 */}
      {toast ? (
        <ToastBar
          message={toast.message}
          tone={toast.tone}
          bottom={actionBarHeight + ACTION_BAR_GAP * 2}
        />
      ) : null}

      {/* 悬浮拖拽层：渲染在列表与操作条之上，跟随手指并带放大与加深阴影。 */}
      {overlayProduct ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dragLayer,
            {
              width: cardWidth,
              transform: [
                { translateX: dragPos.x },
                { translateY: dragPos.y },
                { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
              ],
            },
          ]}
        >
          <View style={[styles.card, styles.cardDragging, { width: cardWidth }]}>
            <CardBody product={overlayProduct} pinned />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

type PinnedCardProps = {
  product: Product;
  width: number;
  /** 正处于拖拽中的卡片：保留挂载，只把外观换成空占位槽。 */
  dragging: boolean;
  onPress: (id: string) => void;
  onPressIn: () => void;
  onLongPress: (id: string, event: GestureResponderEvent) => void;
  onPressOut: () => void;
};

/**
 * 置顶卡片：短按进详情，长按 0.5 秒进入拖拽模式。
 * 长按用 Pressable 自带的调度器（纯 JS 线程），移动交给根容器的 PanResponder，
 * 全程不依赖手势库的跨线程回调，避免长按判定成功却拖不起来的静默失败。
 */
function PinnedCard({ product, width, dragging, onPress, onPressIn, onLongPress, onPressOut }: PinnedCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, { width }, !dragging && pressed && styles.pressed]}
      delayLongPress={LONG_PRESS_MS}
      onPressIn={onPressIn}
      onLongPress={(event) => onLongPress(product.id, event)}
      onPressOut={onPressOut}
      onPress={() => onPress(product.id)}
    >
      {/* 内容不参与触摸：让触点目标始终是整张卡片本身，
          这样长按事件里的 locationX / locationY 就是相对卡片的偏移，悬浮层才能精确贴合卡片。
          同时占位槽只隐藏内容，保留原有高度，避免拖拽时列表整体位移。 */}
      <View style={dragging ? styles.placeholderContent : undefined} pointerEvents="none">
        <CardBody product={product} pinned />
      </View>
      {/* 占位槽是独立挂载的一层遮罩：卡片自身永远不切换 borderStyle，
          因此松手后不可能残留虚线边框，无需依赖样式回滚。 */}
      {dragging ? <View style={styles.placeholderSlot} pointerEvents="none" /> : null}
    </Pressable>
  );
}

function CardBody({ product, pinned }: { product: Product; pinned: boolean }) {
  // 库存状态同时用文字和颜色表达：颜色只做辅助，色觉障碍用户也能读懂。
  const outOfStock = product.stock === 0;
  const lowStock = product.stock === 1;
  const stockStyle = outOfStock ? styles.stockEmpty : lowStock ? styles.stockLow : undefined;
  // 条码一栏拆成「首个条码 + 固定后缀」两段：长条码只压缩前半段，后缀始终完整可读。
  const barcodeCount = product.barcodes.length;
  const barcodeHead = barcodeCount === 0 ? '未绑定条码' : product.barcodes[0];

  return (
    <>
      {/* 名称与置顶徽标同一行、垂直居中；行内左右留白由卡片 padding 统一保证对称。 */}
      <View style={styles.cardHead}>
        <Text style={styles.name} numberOfLines={2} maxFontSizeMultiplier={textScale.title}>
          {product.name}
        </Text>
        {pinned ? (
          <View style={styles.pinBadge}>
            <MaterialCommunityIcons name="pin" size={12} color={colors.tealStrong} />
          </View>
        ) : null}
      </View>
      {/* 数量与单位成组左对齐；异常库存时在同行右侧补一枚状态胶囊，与数字上下居中。 */}
      <View style={styles.stockRow}>
        <View style={styles.stockValue}>
          <Text style={[styles.stock, stockStyle]} maxFontSizeMultiplier={textScale.number}>
            {product.stock}
          </Text>
          <Text maxFontSizeMultiplier={textScale.body} style={styles.stockUnit}>件</Text>
        </View>
        {outOfStock || lowStock ? (
          <View style={[styles.statusPill, outOfStock ? styles.statusPillDanger : styles.statusPillWarning]}>
            <Text
              maxFontSizeMultiplier={textScale.body}
              style={[styles.statusPillText, outOfStock ? styles.statusTextDanger : styles.statusTextWarning]}
            >
              {outOfStock ? '缺货' : '库存偏低'}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.barcodeRow}>
        <Text maxFontSizeMultiplier={textScale.body} style={styles.barcode} numberOfLines={1} ellipsizeMode="middle">
          {barcodeHead}
        </Text>
        {barcodeCount > 1 ? (
          <Text maxFontSizeMultiplier={textScale.body} style={styles.barcodeMore}>{`等${barcodeCount}个条码`}</Text>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  titleWrap: {
    flex: 1,
  },
  /** 点击热区贴合标题文本宽度，不向右侧搜索按钮方向延展。 */
  titleTap: {
    alignSelf: 'flex-start',
  },
  title: {
    ...type.display,
    color: colors.ink,
    fontWeight: weight.bold,
  },
  subtitle: {
    marginTop: space.xs,
    ...type.caption,
    color: colors.muted,
    fontWeight: weight.regular,
  },
  searchButton: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.card,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: size.touch,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: space.md,
    ...elevation.card,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    color: colors.ink,
    ...type.body,
  },
  /** 清空键做成 44×44 热区，视觉上仍贴着输入框右侧内边距。 */
  searchClear: {
    width: size.touch,
    height: size.touch,
    marginRight: -space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: {
    paddingHorizontal: space.xs,
  },
  cancelText: {
    color: colors.tealStrong,
    ...type.body,
    fontWeight: weight.bold,
  },
  listWrap: {
    flex: 1,
  },
  list: {
    flexGrow: 1,
    paddingHorizontal: LIST_PADDING,
  },
  row: {
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  pinnedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
    marginBottom: space.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    ...elevation.card,
  },
  cardDragging: {
    ...elevation.drag,
  },
  placeholderSlot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.placeholderLine,
    backgroundColor: colors.bg,
  },
  placeholderContent: {
    opacity: 0,
  },
  cardHead: {
    flexDirection: 'row',
    // 顶部对齐：标题保持与普通卡片一致的顶部基线，由徽标自己微调去对齐首行文字。
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
  },
  pinBadge: {
    width: size.badge,
    height: size.badge,
    borderRadius: radius.sm,
    marginLeft: space.sm,
    // 标题首行行高 26、徽标高 20：上移 4 后徽标中心与首行文字中心基本重合。
    marginTop: space.xs,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: press.opacity,
  },
  name: {
    flex: 1,
    color: colors.ink,
    ...type.title,
    fontWeight: weight.bold,
    // 两行标题高度预留在标题自身：标题仍贴顶部，同时保证卡片总高度与拖拽几何一致。
    minHeight: type.title.lineHeight * 2,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
  },
  /** 数字与单位按基线对齐，单位贴着数字右侧。 */
  stockValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xs,
  },
  stock: {
    ...type.number,
    color: colors.teal,
    fontWeight: weight.bold,
    // 等宽数字：两列并排时个位与十位始终对齐。
    fontVariant: ['tabular-nums'],
  },
  stockEmpty: {
    color: colors.danger,
  },
  stockLow: {
    color: colors.warning,
  },
  stockUnit: {
    ...type.caption,
    color: colors.muted,
    fontWeight: weight.regular,
  },
  statusPill: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  statusPillDanger: {
    backgroundColor: colors.dangerSoft,
  },
  statusPillWarning: {
    backgroundColor: colors.warningSoft,
  },
  statusPillText: {
    ...type.caption,
    fontWeight: weight.bold,
  },
  statusTextDanger: {
    color: colors.dangerStrong,
  },
  statusTextWarning: {
    color: colors.warningStrong,
  },
  /** 条码行：首码可收缩并中段省略，「等 N 个条码」保持原宽不被压缩。 */
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.sm,
  },
  barcode: {
    flexShrink: 1,
    ...type.caption,
    color: colors.muted,
    fontWeight: weight.regular,
    fontVariant: ['tabular-nums'],
  },
  barcodeMore: {
    flexShrink: 0,
    ...type.caption,
    color: colors.muted,
    fontWeight: weight.regular,
    fontVariant: ['tabular-nums'],
  },
  dragLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 20,
    elevation: 24,
  },
  actionBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: space.lg,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingVertical: space.sm,
    ...elevation.float,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.lg,
  },
  actionPressed: {
    backgroundColor: colors.bg,
  },
  actionIcon: {
    width: size.iconTile,
    height: size.iconTile,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    ...type.caption,
    fontWeight: weight.bold,
  },
  actionDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: space.md,
  },
  empty: {
    marginTop: space.xxl,
    alignItems: 'center',
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  emptyTitle: {
    ...type.title,
    color: colors.ink,
    fontWeight: weight.bold,
  },
  emptyText: {
    ...type.body,
    color: colors.muted,
    fontWeight: weight.regular,
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: space.sm,
    minHeight: size.touch,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionText: {
    ...type.body,
    color: colors.tealStrong,
    fontWeight: weight.bold,
  },
});
