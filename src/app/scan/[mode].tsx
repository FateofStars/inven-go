import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddProductModal, type ProductSelection } from '@/components/AddProductModal';
import { QuantitySheet } from '@/components/QuantitySheet';
import { ToastBar, type ToastTone } from '@/components/ToastBar';
import { useInventory } from '@/context/InventoryContext';
import { BARCODE_TYPES } from '@/lib/barcode';
import type { Product } from '@/lib/types';
import { colors } from '@/theme';

/** 全局死锁时长：命中有效商品后 3 秒内忽略全部扫码事件。 */
const SCAN_LOCK_MS = 3000;

/** 同一个「无效条码」的重复回流去重窗口：不锁死扫描，只是不让同一条码反复刷屏。 */
const INVALID_ECHO_MS = 1500;

type ScanMode = 'inbound' | 'outbound' | 'query';

type Composer = {
  barcode: string;
  query: string;
  name: string;
  selection: ProductSelection;
  quantity: number;
};

/** 入库命中后可点开补录数量的目标商品。 */
type BulkTarget = { productId: string; name: string };

type ToastState = {
  id: number;
  message: string;
  tone: ToastTone;
  sticky?: boolean;
  actionHint?: string;
  /** 无此商品时：点击提示条进入添加商品表单。 */
  barcode?: string;
  /** 入库成功时：点击提示条进入数量补录面板。 */
  bulk?: BulkTarget;
};

const titles: Record<ScanMode, string> = {
  inbound: '入库扫描',
  outbound: '出库扫描',
  query: '库存查询',
};

const hints: Record<ScanMode, string> = {
  inbound: '将扫描框对准商品条码以增添库存或新建库存信息',
  outbound: '将扫描框对准商品条码以减少库存',
  query: '将扫描框对准商品条码以查询库存信息',
};

/** 进入 3 秒死锁冷却时，标题下方的引导文案统一切换为这一句。 */
const COOLING_HINT = '冷却中，稍后即可重新扫描';

function isScanMode(value: string): value is ScanMode {
  return value === 'inbound' || value === 'outbound' || value === 'query';
}

export default function ScanScreen() {
  const params = useLocalSearchParams<{ mode: string }>();
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const mode: ScanMode = rawMode && isScanMode(rawMode) ? rawMode : 'inbound';
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const { products, inboundScan, outboundScan, findByBarcode, createProduct, bindBarcode, adjustStock } = useInventory();
  const [torch, setTorch] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [bulk, setBulk] = useState<BulkTarget | null>(null);
  const [bulkQuantity, setBulkQuantity] = useState(1);
  const [applying, setApplying] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  /** 与 lockRef 同步的可见状态：驱动标题下方文案在冷却期与默认引导之间切换。 */
  const [cooling, setCooling] = useState(false);
  const [queryHit, setQueryHit] = useState<{ product: Product; barcode: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lockRef = useRef(false);
  /** 本次扫码结果尚未返回的极短窗口：防止异步期间对同一码重复计数。 */
  const scanBusyRef = useRef(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastId = useRef(0);

  useEffect(() => {
    if (!toast || toast.sticky) return;
    const timer = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = (next: Omit<ToastState, 'id'>) => {
    toastId.current += 1;
    setToast({ ...next, id: toastId.current });
  };

  /** 立刻上锁并开始 3 秒倒计时，倒计时结束自动解锁。 */
  const lockScan = () => {
    lockRef.current = true;
    setCooling(true);
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => {
      lockRef.current = false;
      lockTimer.current = null;
      setCooling(false);
    }, SCAN_LOCK_MS);
  };

  /** 用户主动要求重新扫描时提前解锁，不必等满 3 秒。 */
  const releaseScanLock = () => {
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = null;
    lockRef.current = false;
    setCooling(false);
  };

  /**
   * 无效条码不进冷却，但对同一个无效条码做短暂去重：
   * 摄像头对同一码会连续回调，这里只拦「同一个码的重复回流」，
   * 换成另一个条码时立刻放行，从而支持无效商品的无缝连扫排查。
   */
  const recentInvalid = useRef({ code: '', at: 0 });
  const showInvalidScan = (code: string, next: Omit<ToastState, 'id'>) => {
    const now = Date.now();
    if (recentInvalid.current.code === code && now - recentInvalid.current.at < INVALID_ECHO_MS) return;
    recentInvalid.current = { code, at: now };
    showToast(next);
  };

  /**
   * 扫码分流策略：
   * - 命中有效商品 → 立刻进入 3 秒全局死锁冷却，避免重复计数；
   * - 无效/未登记商品 → 绝不锁死，允许立刻对准下一个条码。
   * scanBusyRef 只看住「本次结果尚未返回」的极短窗口，防止异步期间重复受理。
   */
  const onBarcodeScanned = (result: BarcodeScanningResult) => {
    const code = result.data.trim();
    if (!code) return;
    if (lockRef.current || scanBusyRef.current) return;

    if (composer && rescanning) {
      setComposer((current) => (current ? { ...current, barcode: code } : current));
      setRescanning(false);
      lockScan();
      showToast({ message: '条码已填入', tone: 'info' });
      return;
    }
    if (composer || queryHit) return;

    scanBusyRef.current = true;

    if (mode === 'inbound') {
      void inboundScan(code)
        .then((scan) => {
          if (scan.kind === 'missing') {
            showInvalidScan(code, {
              message: '无此商品，点击提示框可添加商品',
              tone: 'warning',
              sticky: true,
              actionHint: '点击此处添加',
              barcode: code,
            });
            return;
          }
          lockScan();
          showToast({
            message: `添加成功 · ${scan.product.name} 库存 ${scan.product.stock}`,
            tone: 'success',
            sticky: true,
            actionHint: '点击可修改本次入库数量',
            bulk: { productId: scan.product.id, name: scan.product.name },
          });
        })
        .finally(() => {
          scanBusyRef.current = false;
        });
      return;
    }

    if (mode === 'outbound') {
      void outboundScan(code)
        .then((scan) => {
          if (scan.kind === 'missing') {
            showInvalidScan(code, { message: '无此商品，请重新扫描', tone: 'warning' });
            return;
          }
          // 库存为 0 也是「有效商品」，同样进入冷却，避免反复刷同一条码。
          lockScan();
          if (scan.kind === 'empty') {
            showToast({ message: `「${scan.name}」库存已为 0，无法出库`, tone: 'warning' });
            return;
          }
          showToast({ message: `出库成功 · ${scan.product.name} 剩余 ${scan.product.stock}`, tone: 'success' });
        })
        .finally(() => {
          scanBusyRef.current = false;
        });
      return;
    }

    const product = findByBarcode(code);
    scanBusyRef.current = false;
    if (!product) {
      showInvalidScan(code, { message: '无此商品，请重新扫描', tone: 'warning' });
      return;
    }
    lockScan();
    setToast(null);
    setQueryHit({ product, barcode: code });
  };

  const openComposer = (barcode: string) => {
    setToast(null);
    setFormError(null);
    setRescanning(false);
    setComposer({ barcode, query: '', name: '', selection: null, quantity: 1 });
  };

  const openBulkSheet = (target: BulkTarget) => {
    setToast(null);
    setBulkQuantity(1);
    setBulk(target);
  };

  /** 提示条只有一个入口：无此商品去添加，入库成功去补录数量。 */
  const resolveToastAction = (state: ToastState): (() => void) | undefined => {
    if (state.bulk) {
      const target = state.bulk;
      return () => openBulkSheet(target);
    }
    if (state.sticky && state.barcode) {
      const code = state.barcode;
      return () => openComposer(code);
    }
    return undefined;
  };

  const submitBulk = async () => {
    if (!bulk || applying) return;
    const target = bulk;
    // 扫码时已经 +1，这里只把差额补上。
    const delta = bulkQuantity - 1;
    if (delta === 0) {
      setBulk(null);
      showToast({ message: `「${target.name}」保持入库 1 件`, tone: 'info' });
      return;
    }
    setApplying(true);
    const result = await adjustStock(target.productId, delta);
    setApplying(false);
    setBulk(null);
    if (!result.ok) {
      showToast({ message: result.message, tone: 'warning' });
      return;
    }
    showToast({
      message: `已补录 ${delta} 件 · ${result.product.name} 库存 ${result.product.stock}`,
      tone: 'success',
    });
  };

  const submitComposer = async () => {
    if (!composer || submitting) return;
    const barcode = composer.barcode.trim();
    if (!barcode) {
      setFormError('请填写条形码');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (composer.selection?.type === 'existing') {
        const result = await bindBarcode(composer.selection.productId, barcode, composer.quantity);
        if (result.kind === 'duplicate') {
          setFormError('该条码已属于其他商品');
          return;
        }
        if (result.kind === 'missing-product') {
          setFormError('所选商品不存在');
          return;
        }
        setComposer(null);
        showToast({ message: `添加成功 · ${result.product.name} 库存 ${result.product.stock}`, tone: 'success' });
        return;
      }

      if (composer.selection?.type !== 'new') {
        setFormError('请选择已有产品，或点击「+ 新增产品」');
        return;
      }
      const result = await createProduct(composer.name, barcode, composer.quantity);
      if (result.kind === 'duplicate') {
        setFormError('该条码已存在，请改选对应产品');
        return;
      }
      if (result.kind === 'invalid') {
        setFormError('请填写产品名称和条形码');
        return;
      }
      setComposer(null);
      showToast({ message: `添加成功 · ${result.product.name}`, tone: 'success' });
    } finally {
      setSubmitting(false);
    }
  };

  const scannerEnabled =
    Boolean(permission?.granted) && (!composer || rescanning) && !queryHit && !bulk;

  if (!permission) {
    return <View style={styles.empty} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permission, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.permissionTitle}>需要相机权限</Text>
        <Text style={styles.permissionText}>扫描条形码前，请允许库存管理使用相机。</Text>
        <Pressable style={styles.permissionButton} onPress={() => void requestPermission()}>
          <Text style={styles.permissionButtonText}>允许使用相机</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>返回</Text>
        </Pressable>
      </View>
    );
  }

  const liveProduct = queryHit ? products.find((item) => item.id === queryHit.product.id) ?? queryHit.product : null;

  return (
    <View style={styles.screen}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: [...BARCODE_TYPES],
        }}
        onBarcodeScanned={scannerEnabled ? onBarcodeScanned : undefined}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable style={styles.iconButton} onPress={() => router.back()}>
            <Text style={styles.iconText}>关闭</Text>
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>{titles[mode]}</Text>
            <Text style={styles.hint}>
              {rescanning ? '对准新条码，扫描后自动返回表单' : cooling ? COOLING_HINT : hints[mode]}
            </Text>
          </View>
          <Pressable style={styles.iconButton} onPress={() => setTorch((value) => !value)}>
            <Text style={styles.iconText}>{torch ? '关灯' : '补光'}</Text>
          </Pressable>
        </View>

        <View style={styles.frame} pointerEvents="none">
          <View style={styles.frameBox} />
        </View>

        {rescanning ? (
          <Pressable style={[styles.resume, { bottom: insets.bottom + 28 }]} onPress={() => setRescanning(false)}>
            <Text style={styles.resumeText}>返回添加商品</Text>
          </Pressable>
        ) : null}

        {toast && !composer && !queryHit && !bulk ? (
          <ToastBar
            message={toast.message}
            tone={toast.tone}
            actionHint={toast.actionHint}
            bottom={insets.bottom + 24}
            onPress={resolveToastAction(toast)}
          />
        ) : null}
      </View>

      {liveProduct && queryHit ? (
        <View style={styles.cardBackdrop}>
          <View style={styles.queryCard}>
            <Text style={styles.queryKicker}>查询结果</Text>
            <Text style={styles.queryName}>{liveProduct.name}</Text>
            <Text style={styles.queryStock}>{liveProduct.stock}</Text>
            <Text style={styles.queryStockLabel}>当前剩余库存</Text>
            <Text style={styles.queryBarcodeTitle}>绑定条码</Text>
            {liveProduct.barcodes.map((code) => {
              const matched = code === queryHit.barcode;
              return (
                <Text key={code} style={[styles.queryBarcode, matched && styles.queryBarcodeHit]}>
                  {matched ? '本次扫描 · ' : ''}
                  {code}
                </Text>
              );
            })}
            <Pressable
              style={styles.queryClose}
              onPress={() => {
                // 查询是「看一眼下一个」的高频动作，这里提前解锁，不必等满 3 秒。
                releaseScanLock();
                setQueryHit(null);
              }}
            >
              <Text style={styles.queryCloseText}>关闭并继续扫描</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <QuantitySheet
        visible={bulk !== null}
        title="修改本次入库数量"
        productName={bulk?.name ?? ''}
        hint="扫描时已自动入库 1 件，这里填写本次实际入库的总数量，确认后补录差额。"
        quantity={bulkQuantity}
        onChangeQuantity={setBulkQuantity}
        busy={applying}
        onConfirm={() => void submitBulk()}
        onClose={() => setBulk(null)}
      />

      <AddProductModal
        visible={composer !== null && !rescanning}
        barcode={composer?.barcode ?? ''}
        query={composer?.query ?? ''}
        name={composer?.name ?? ''}
        selection={composer?.selection ?? null}
        products={products}
        quantity={composer?.quantity ?? 1}
        error={formError}
        submitting={submitting}
        onChangeBarcode={(barcode) => setComposer((current) => (current ? { ...current, barcode } : current))}
        onChangeQuery={(query) => setComposer((current) => (current ? { ...current, query } : current))}
        onChangeName={(name) => setComposer((current) => (current ? { ...current, name } : current))}
        onChangeSelection={(selection) => setComposer((current) => (current ? { ...current, selection } : current))}
        onChangeQuantity={(quantity) => setComposer((current) => (current ? { ...current, quantity } : current))}
        onRescan={() => {
          releaseScanLock();
          setRescanning(true);
        }}
        onClose={() => {
          setComposer(null);
          setRescanning(false);
          setFormError(null);
        }}
        onSubmit={() => void submitComposer()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.camera,
  },
  empty: {
    flex: 1,
    backgroundColor: colors.camera,
  },
  overlay: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
  },
  iconButton: {
    minWidth: 52,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(16,17,15,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  hint: {
    marginTop: 4,
    color: '#E7E0D4',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  frame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameBox: {
    width: 260,
    height: 160,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,252,247,0.92)',
    backgroundColor: 'transparent',
  },
  resume: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  resumeText: {
    color: colors.ink,
    fontWeight: '800',
  },
  cardBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  queryCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 22,
  },
  queryKicker: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '800',
  },
  queryName: {
    marginTop: 8,
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
  },
  queryStock: {
    marginTop: 12,
    color: colors.teal,
    fontSize: 48,
    fontWeight: '800',
  },
  queryStockLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  queryBarcodeTitle: {
    marginTop: 16,
    marginBottom: 8,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  queryBarcode: {
    color: colors.ink,
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    fontSize: 14,
  },
  queryBarcodeHit: {
    backgroundColor: '#F8E7A8',
    color: colors.ink,
    fontWeight: '800',
  },
  queryClose: {
    marginTop: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queryCloseText: {
    color: colors.white,
    fontWeight: '800',
  },
  permission: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 24,
    gap: 14,
  },
  permissionTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
  },
  permissionText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  permissionButton: {
    height: 50,
    borderRadius: 16,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionButtonText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  backLink: {
    color: colors.navy,
    fontWeight: '700',
    textAlign: 'center',
  },
});
