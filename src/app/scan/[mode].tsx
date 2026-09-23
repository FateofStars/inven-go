import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddProductModal, type ProductSelection } from '@/components/AddProductModal';
import { ToastBar, type ToastTone } from '@/components/ToastBar';
import { useInventory } from '@/context/InventoryContext';
import type { Product } from '@/lib/types';
import { colors } from '@/theme';

type ScanMode = 'inbound' | 'outbound' | 'query';

type Composer = {
  barcode: string;
  query: string;
  name: string;
  selection: ProductSelection;
};

type ToastState = {
  id: number;
  message: string;
  tone: ToastTone;
  sticky?: boolean;
  actionHint?: string;
  barcode?: string;
};

const titles: Record<ScanMode, string> = {
  inbound: '入库扫描',
  outbound: '出库扫描',
  query: '库存查询',
};

const hints: Record<ScanMode, string> = {
  inbound: '连续扫描。已有商品会直接加库存。',
  outbound: '连续扫描。匹配后库存减 1，不会低于 0。',
  query: '扫到商品后会暂停，并显示库存卡片。',
};

function isScanMode(value: string): value is ScanMode {
  return value === 'inbound' || value === 'outbound' || value === 'query';
}

export default function ScanScreen() {
  const params = useLocalSearchParams<{ mode: string }>();
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const mode: ScanMode = rawMode && isScanMode(rawMode) ? rawMode : 'inbound';
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const { products, inboundScan, outboundScan, findByBarcode, createProduct, bindBarcode } = useInventory();
  const [torch, setTorch] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [queryHit, setQueryHit] = useState<{ product: Product; barcode: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lockRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
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

  const acceptScan = (code: string) => {
    const now = Date.now();
    if (lockRef.current.code === code && now - lockRef.current.at < 1400) return false;
    lockRef.current = { code, at: now };
    return true;
  };

  const onBarcodeScanned = (result: BarcodeScanningResult) => {
    const code = result.data.trim();
    if (!code) return;
    if (composer && rescanning) {
      if (!acceptScan(code)) return;
      setComposer((current) => (current ? { ...current, barcode: code } : current));
      setRescanning(false);
      showToast({ message: '条码已填入', tone: 'info' });
      return;
    }
    if (composer || queryHit) return;
    if (!acceptScan(code)) return;

    if (mode === 'inbound') {
      void inboundScan(code).then((scan) => {
        if (scan.kind === 'missing') {
          showToast({
            message: '无此商品，点击提示框可添加商品',
            tone: 'warning',
            sticky: true,
            actionHint: '点击此处添加',
            barcode: code,
          });
          return;
        }
        showToast({ message: `添加成功 · ${scan.product.name} 库存 ${scan.product.stock}`, tone: 'success' });
      });
      return;
    }

    if (mode === 'outbound') {
      void outboundScan(code).then((scan) => {
        if (scan.kind === 'missing') {
          showToast({ message: '无此商品，请重新扫描', tone: 'warning' });
          return;
        }
        if (scan.kind === 'empty') {
          showToast({ message: `「${scan.name}」库存已为 0，无法出库`, tone: 'warning' });
          return;
        }
        showToast({ message: `出库成功 · ${scan.product.name} 剩余 ${scan.product.stock}`, tone: 'success' });
      });
      return;
    }

    const product = findByBarcode(code);
    if (!product) {
      showToast({ message: '无此商品，请重新扫描', tone: 'warning' });
      return;
    }
    setToast(null);
    setQueryHit({ product, barcode: code });
  };

  const openComposer = (barcode: string) => {
    setToast(null);
    setFormError(null);
    setRescanning(false);
    setComposer({ barcode, query: '', name: '', selection: null });
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
        const result = await bindBarcode(composer.selection.productId, barcode);
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
      const result = await createProduct(composer.name, barcode);
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

  const scannerEnabled = Boolean(permission?.granted) && (!composer || rescanning) && !queryHit;

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
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'codabar', 'itf14', 'qr'],
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
            <Text style={styles.hint}>{rescanning ? '对准新条码，扫描后自动返回表单' : hints[mode]}</Text>
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

        {toast && !composer && !queryHit ? (
          <ToastBar
            message={toast.message}
            tone={toast.tone}
            actionHint={toast.actionHint}
            bottom={insets.bottom + 24}
            onPress={
              toast.sticky && toast.barcode
                ? () => openComposer(toast.barcode as string)
                : undefined
            }
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
            <Pressable style={styles.queryClose} onPress={() => setQueryHit(null)}>
              <Text style={styles.queryCloseText}>关闭并继续扫描</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <AddProductModal
        visible={composer !== null && !rescanning}
        barcode={composer?.barcode ?? ''}
        query={composer?.query ?? ''}
        name={composer?.name ?? ''}
        selection={composer?.selection ?? null}
        products={products}
        error={formError}
        submitting={submitting}
        onChangeBarcode={(barcode) => setComposer((current) => (current ? { ...current, barcode } : current))}
        onChangeQuery={(query) => setComposer((current) => (current ? { ...current, query } : current))}
        onChangeName={(name) => setComposer((current) => (current ? { ...current, name } : current))}
        onChangeSelection={(selection) => setComposer((current) => (current ? { ...current, selection } : current))}
        onRescan={() => {
          lockRef.current = { code: '', at: 0 };
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
