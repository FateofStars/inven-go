import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarcodeReplaceSheet } from '@/components/BarcodeReplaceSheet';
import { BARCODE_TYPES } from '@/lib/barcode';
import { colors } from '@/theme';

/** 清空输入后短时间内忽略刚被清掉的条码，留出把镜头移向新条码的时间。 */
const CLEAR_GRACE_MS = 1500;
/** 取消替换后重新武装摄像头的死锁时长：手指可能还没从原条码上移开。 */
const CANCEL_LOCK_MS = 1000;

type BarcodeScanModalProps = {
  title: string;
  hint?: string;
  /** 传入即进入「修改条码」模式：取到码先弹新旧对比面板，确认后才回调。 */
  replaceFrom?: string;
  onCancel: () => void;
  onSubmit: (barcode: string) => void;
};

/**
 * 取码弹窗：输入框为空时摄像头持续取码，取到即回填并停住，避免和手动输入打架。
 *
 * 「修改条码」模式下取到码不会直接回调，而是就地升起新旧对比面板（覆盖在本页之上，
 * 不退出扫码界面）；取消则留在原处并在 1 秒内不再取码，方便立刻重扫。
 * 调用方按需挂载（不需要 visible 属性），每次打开都是全新的干净状态。
 */
export function BarcodeScanModal({ title, hint, replaceFrom, onCancel, onSubmit }: BarcodeScanModalProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [value, setValue] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [cooling, setCooling] = useState(false);
  const [torch, setTorch] = useState(false);
  const lastRef = useRef({ code: '', at: 0 });
  const coolTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const granted = Boolean(permission?.granted);
  const trimmed = value.trim();
  const replacing = replaceFrom !== undefined;
  // 输入框有内容、对比面板升起、或处于取消后的冷却期，都停掉取码。
  const scanning = value === '' && pending === null && !cooling;
  const pendingReplace = replacing && pending !== null ? pending : null;

  const lockScan = (ms: number) => {
    setCooling(true);
    if (coolTimer.current) clearTimeout(coolTimer.current);
    coolTimer.current = setTimeout(() => {
      setCooling(false);
      coolTimer.current = null;
    }, ms);
  };

  const handleScanned = (result: BarcodeScanningResult) => {
    const code = result.data.trim();
    if (!code) return;
    const now = Date.now();
    if (lastRef.current.code === code && now - lastRef.current.at < CLEAR_GRACE_MS) return;
    lastRef.current = { code, at: now };
    if (replacing) {
      // 扫码即弹对比面板，不再要求用户去点下方的「确认」。
      setPending(code);
      return;
    }
    setValue(code);
  };

  const clearInput = () => {
    const current = value.trim();
    lastRef.current = current ? { code: current, at: Date.now() } : { code: '', at: 0 };
    setValue('');
  };

  const submitTyped = () => {
    if (!trimmed) return;
    if (replacing) {
      // 手动输入仍走「点确认 → 弹对比面板」，同样不退出扫码界面。
      setPending(trimmed);
      return;
    }
    onSubmit(trimmed);
  };

  const cancelReplace = () => {
    setPending(null);
    setValue('');
    lastRef.current = { code: '', at: 0 };
    lockScan(CANCEL_LOCK_MS);
  };

  const statusHint = scanning
    ? hint ?? '对准条码扫描，或手动输入'
    : cooling
      ? '冷却中，稍后即可重新扫描'
      : '已填入条码，清空输入后可重新扫描';

  return (
    // 对比面板升起时，系统返回键先收起面板，而不是直接退出扫码页。
    <Modal visible transparent animationType="slide" onRequestClose={() => (pendingReplace !== null ? cancelReplace() : onCancel())}>
      <View style={styles.screen}>
        {granted ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={scanning ? handleScanned : undefined}
            />
            {/* 取景框绝对定位在全屏容器正中：底部输入区增删内容都不会让它位移。 */}
            <View style={styles.frame} pointerEvents="none">
              <View style={styles.frameBox} />
            </View>
          </>
        ) : (
          <View style={styles.permission}>
            <Text style={styles.permissionTitle}>需要相机权限</Text>
            <Text style={styles.permissionText}>允许使用相机后即可扫码，也可以在下方直接手动录入条码。</Text>
            <Pressable style={styles.permissionButton} onPress={() => void requestPermission()}>
              <Text style={styles.permissionButtonText}>允许使用相机</Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <Pressable style={styles.iconButton} onPress={onCancel}>
            <Text style={styles.iconText}>关闭</Text>
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.hint}>{statusHint}</Text>
          </View>
          <Pressable
            style={styles.iconButton}
            onPress={() => setTorch((current) => !current)}
            accessibilityLabel={torch ? '关闭补光' : '开启补光'}
          >
            <Text style={styles.iconText}>{torch ? '关灯' : '补光'}</Text>
          </Pressable>
        </View>

        {granted ? <View style={styles.filler} /> : null}

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="手动输入条形码"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            selectTextOnFocus
          />
          <View style={styles.actions}>
            <Pressable
              style={[styles.clear, !value && styles.clearDisabled]}
              onPress={clearInput}
              disabled={!value}
              accessibilityState={{ disabled: !value }}
            >
              <Text style={styles.clearText}>清空输入</Text>
            </Pressable>
            <Pressable
              style={[styles.submit, !trimmed && styles.submitDisabled]}
              onPress={submitTyped}
              disabled={!trimmed}
              accessibilityState={{ disabled: !trimmed }}
            >
              <Text style={styles.submitText}>确认</Text>
            </Pressable>
          </View>
        </View>

        {pendingReplace !== null && replaceFrom !== undefined ? (
          <BarcodeReplaceSheet
            previous={replaceFrom}
            next={pendingReplace}
            onCancel={cancelReplace}
            onConfirm={() => onSubmit(pendingReplace)}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.camera,
  },
  permission: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 24,
  },
  permissionTitle: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
  },
  permissionText: {
    color: '#D9CBB8',
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
    fontSize: 16,
    fontWeight: '800',
  },
  top: {
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
    lineHeight: 17,
    textAlign: 'center',
  },
  filler: {
    flex: 1,
  },
  frame: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameBox: {
    width: 260,
    height: 160,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,252,247,0.92)',
  },
  bottom: {
    gap: 12,
    paddingHorizontal: 16,
  },
  input: {
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  clear: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,252,247,0.16)',
  },
  clearDisabled: {
    opacity: 0.45,
  },
  clearText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  submit: {
    flex: 1.4,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
});
