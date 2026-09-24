import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenterCard } from '@/components/CenterCard';
import { ToastBar } from '@/components/ToastBar';
import { getAppVersion } from '@/constants/appInfo';
import { useInventory } from '@/context/InventoryContext';
import { listSnapshots, readPickedText, readSnapshotText, saveSnapshot, type Snapshot } from '@/lib/backup';
import { parseDatabase } from '@/lib/database';
import { formatTimestamp } from '@/lib/format';
import type { ImportMode } from '@/lib/types';
import { colors, shadow } from '@/theme';

/** 清空数据库必须精准输入的确认词（区分大小写）。 */
const CLEAR_CONFIRM_WORD = 'Yes';

type BusyState = 'export' | 'clipboard' | 'import' | 'clear' | null;

/** 已经读取并通过校验、等待用户确认的待导入数据。 */
type PendingImport = {
  source: string;
  raw: string;
  productCount: number;
  logCount: number;
};

export default function SettingsScreen() {
  const { products, logs, exportDatabase, importDatabase, clearDatabase } = useInventory();
  const insets = useSafeAreaInsets();

  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [askClear, setAskClear] = useState(false);

  const [textValue, setTextValue] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [clearInput, setClearInput] = useState('');

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);

  const [busy, setBusy] = useState<BusyState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const refreshSnapshots = useCallback(async () => {
    setSnapshotsLoading(true);
    try {
      setSnapshots(await listSnapshots());
    } catch {
      setSnapshots([]);
    } finally {
      setSnapshotsLoading(false);
    }
  }, []);

  /**
   * 进入设置页（含冷启动首次进入）与每次重新聚焦时都同步一次快照列表。
   * 否则冷启动后「导出」弹窗里的份数会一直显示 0，必须先打开「导入」弹窗才会被带出来。
   * useFocusEffect 在页面首次获得焦点时同样会执行，因此无需再补一个 useEffect。
   */
  useFocusEffect(
    useCallback(() => {
      void refreshSnapshots();
    }, [refreshSnapshots]),
  );

  /**
   * 导出前的统一时序：先提交「导出」日志并落盘，拿到持久化后的完整快照，
   * 再静默保存一份本机快照，最后把文本交给分享或剪贴板通道。
   */
  const buildExportText = useCallback(async () => {
    const snapshot = await exportDatabase();
    const text = JSON.stringify(snapshot, null, 2);
    try {
      saveSnapshot(snapshot);
      setSnapshots(await listSnapshots());
    } catch {
      setNotice('数据库已生成，但本机快照保存失败。');
    }
    return text;
  }, [exportDatabase]);

  const handleShareExport = async () => {
    if (busy) return;
    setBusy('export');
    setNotice(null);
    try {
      const text = await buildExportText();
      const file = new File(Paths.cache, `inventory-${Date.now()}.json`);
      file.write(text);
      if (!(await Sharing.isAvailableAsync())) {
        setNotice('本机不支持系统分享，可改用「复制 JSON 到剪贴板」。');
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: '导出库存数据库',
        UTI: 'public.json',
      });
      setExportOpen(false);
      setToast('已导出并保存本机快照');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '导出失败');
    } finally {
      setBusy(null);
    }
  };

  const handleCopyExport = async () => {
    if (busy) return;
    setBusy('clipboard');
    setNotice(null);
    try {
      await Clipboard.setStringAsync(await buildExportText());
      setExportOpen(false);
      setToast('已复制备份数据到剪贴板');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '复制失败');
    } finally {
      setBusy(null);
    }
  };

  const openImport = () => {
    setNotice(null);
    setImportOpen(true);
    void refreshSnapshots();
  };

  /** 入口 A：读取剪贴板并填入多行文本框，用户可直接导入或手动粘贴修改。 */
  const handlePasteEntry = async () => {
    setImportOpen(false);
    setTextError(null);
    setTextValue('');
    setTextOpen(true);
    try {
      const clip = await Clipboard.getStringAsync();
      setTextValue(clip);
      setTextError(clip.trim() ? null : '剪贴板里没有文本，请在下方粘贴备份 JSON。');
    } catch {
      setTextError('读取剪贴板失败，请在下方手动粘贴备份 JSON。');
    }
  };

  const handleValidateText = () => {
    const raw = textValue.trim();
    if (!raw) {
      setTextError('请先粘贴备份 JSON 文本。');
      return;
    }
    const parsed = parseDatabase(raw);
    if (!parsed) {
      setTextError('内容不是可识别的库存数据库，请检查 JSON 是否完整。');
      return;
    }
    setTextOpen(false);
    setPending({
      source: '剪贴板文本',
      raw,
      productCount: parsed.products.length,
      logCount: parsed.logs.length,
    });
  };

  /** 入口 B：系统文件选择器。 */
  const handlePickFile = async () => {
    if (busy) return;
    setImportOpen(false);
    setBusy('import');
    setNotice(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        // 放开类型限制，避免部分 ROM 因 MIME 过滤给出不可读的虚拟 URI。
        type: '*/*',
        // 尽量让系统先把文件复制到 App 私有缓存目录。
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets[0]) {
        setNotice('已取消选择文件。');
        return;
      }
      let text: string;
      try {
        text = await readPickedText(picked.assets[0].uri);
      } catch {
        setNotice('无法读取所选文件。可改用「从剪贴板文本导入」或本机快照。');
        return;
      }
      const parsed = parseDatabase(text);
      if (!parsed) {
        setNotice('所选文件不是可识别的库存数据库。');
        return;
      }
      setPending({
        source: picked.assets[0].name ?? '本地文件',
        raw: text,
        productCount: parsed.products.length,
        logCount: parsed.logs.length,
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '导入失败');
    } finally {
      setBusy(null);
    }
  };

  /** 通道 C：本机快照，完全不经系统文件管理器。 */
  const handlePickSnapshot = async (snapshot: Snapshot) => {
    if (busy) return;
    setBusy('import');
    setNotice(null);
    try {
      const text = await readSnapshotText(snapshot.uri);
      const parsed = parseDatabase(text);
      if (!parsed) {
        setNotice('该快照已损坏，无法读取。');
        return;
      }
      setImportOpen(false);
      setPending({
        source: `本机快照 ${snapshot.name}`,
        raw: text,
        productCount: parsed.products.length,
        logCount: parsed.logs.length,
      });
    } catch {
      setNotice('读取快照失败。');
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmImport = async () => {
    const current = pending;
    if (!current || busy) return;
    setPending(null);
    setBusy('import');
    setNotice(null);
    try {
      const result = await importDatabase(current.raw, importMode);
      if (result.ok) {
        setNotice(result.detail);
        setToast('数据库导入成功');
        void refreshSnapshots();
        return;
      }
      setNotice(result.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '导入失败');
    } finally {
      setBusy(null);
    }
  };

  const closeClear = () => {
    setClearInput('');
    setAskClear(false);
  };

  const handleConfirmClear = async () => {
    if (clearInput !== CLEAR_CONFIRM_WORD || busy) return;
    closeClear();
    setBusy('clear');
    setNotice(null);
    try {
      await clearDatabase();
      setToast('数据库已成功清空');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '清空失败');
    } finally {
      setBusy(null);
    }
  };

  const mainActions = [
    {
      key: 'export',
      title: '导出数据库',
      text: '系统分享、复制到剪贴板，并自动留存本机快照。',
      icon: 'database-export-outline' as const,
      color: colors.teal,
      soft: colors.tealSoft,
      busy: busy === 'export' || busy === 'clipboard',
      onPress: () => {
        setNotice(null);
        setExportOpen(true);
        // 打开弹窗前再刷新一次，确保展示给用户的份数是实时的。
        void refreshSnapshots();
      },
    },
    {
      key: 'import',
      title: '导入数据库',
      text: '支持剪贴板、手机文件与本机快照三种恢复通道。',
      icon: 'database-import-outline' as const,
      color: colors.navy,
      soft: colors.navySoft,
      busy: busy === 'import',
      onPress: openImport,
    },
    {
      key: 'clear',
      title: '清空数据库',
      text: '永久删除所有库存商品与历史日志，不可恢复。',
      icon: 'database-remove-outline' as const,
      color: colors.danger,
      soft: colors.dangerSoft,
      busy: busy === 'clear',
      onPress: () => {
        setClearInput('');
        setAskClear(true);
      },
    },
    {
      key: 'about',
      title: '关于',
      text: `版本号：${getAppVersion()}`,
      icon: 'information-outline' as const,
      // 沿用【日志】页「导出」日志的配色，保持整套系统主题色一致。
      color: colors.warning,
      soft: colors.warningSoft,
      busy: false,
      onPress: () => router.push('/about'),
    },
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>设置</Text>
          <Text style={styles.subtitle}>软件数据管理</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>本机数据</Text>
          <Text style={styles.summaryValue}>
            {products.length} 个商品 · {logs.length} 条日志
          </Text>
          <Text style={styles.summaryHint}>库存、条码关系和全部日志都保存在这台设备上。</Text>
        </View>

        <View style={styles.actions}>
          {mainActions.map((action) => (
            <PillRow
              key={action.key}
              icon={action.icon}
              color={action.color}
              soft={action.soft}
              title={action.title}
              text={action.text}
              busy={action.busy}
              disabled={busy !== null}
              onPress={action.onPress}
            />
          ))}
        </View>

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </View>

      <CenterCard
        visible={exportOpen}
        title="导出数据库"
        description="两种通道都会先写入导出日志，并在本机保留一份快照（最多 5 份）。"
        cancelLabel="关闭"
        showConfirm={false}
        onCancel={() => setExportOpen(false)}
        onConfirm={() => setExportOpen(false)}
      >
        <View style={styles.rows}>
          <PillRow
            compact
            icon="share-variant-outline"
            color={colors.teal}
            soft={colors.tealSoft}
            title="通过系统分享导出"
            text="生成 JSON 文件并交给系统分享"
            busy={busy === 'export'}
            disabled={busy !== null}
            onPress={() => void handleShareExport()}
          />
          <PillRow
            compact
            icon="content-copy"
            color={colors.navy}
            soft={colors.navySoft}
            title="复制 JSON 到剪贴板"
            text="粘贴到任意聊天或备忘录即可备份"
            busy={busy === 'clipboard'}
            disabled={busy !== null}
            onPress={() => void handleCopyExport()}
          />
        </View>
        <Text style={styles.hint}>本机快照当前 {snapshots.length} 份，导入时可直接还原。</Text>
      </CenterCard>

      <CenterCard
        visible={importOpen}
        title="导入数据库"
        description="选择恢复通道，读取成功后再确认导入方式。"
        cancelLabel="关闭"
        showConfirm={false}
        onCancel={() => setImportOpen(false)}
        onConfirm={() => setImportOpen(false)}
      >
        <View style={styles.rows}>
          <PillRow
            compact
            icon="content-paste"
            color={colors.navy}
            soft={colors.navySoft}
            title="从剪贴板文本导入"
            text="自动读取剪贴板，也可手动粘贴 JSON"
            disabled={busy !== null}
            onPress={() => void handlePasteEntry()}
          />
          <PillRow
            compact
            icon="file-document-outline"
            color={colors.teal}
            soft={colors.tealSoft}
            title="从手机文件选取导入"
            text="调起系统文件管理器选择 JSON"
            busy={busy === 'import'}
            disabled={busy !== null}
            onPress={() => void handlePickFile()}
          />
        </View>

        <Text style={styles.sectionTitle}>历史备份快照</Text>
        {snapshotsLoading ? (
          <View style={styles.snapshotLoading}>
            <ActivityIndicator color={colors.navy} />
          </View>
        ) : snapshots.length === 0 ? (
          <Text style={styles.hint}>还没有本机快照。每次成功导出都会自动生成一份。</Text>
        ) : (
          <View style={styles.rows}>
            {snapshots.map((snapshot) => (
              <PillRow
                key={snapshot.name}
                compact
                icon="history"
                color={colors.clay}
                soft={colors.claySoft}
                title={formatTimestamp(snapshot.createdAt)}
                text={`${snapshot.productCount} 个商品 · ${snapshot.logCount} 条日志`}
                disabled={busy !== null}
                onPress={() => void handlePickSnapshot(snapshot)}
              />
            ))}
          </View>
        )}
      </CenterCard>

      <CenterCard
        visible={textOpen}
        title="粘贴备份数据"
        description="已尝试读取剪贴板。确认无误后校验并导入。"
        confirmLabel="校验并导入"
        confirmDisabled={textValue.trim().length === 0}
        onCancel={() => setTextOpen(false)}
        onConfirm={handleValidateText}
      >
        <Pressable
          style={({ pressed }) => [styles.clipboardButton, pressed && styles.pressed]}
          onPress={() => void handlePasteEntry()}
        >
          <MaterialCommunityIcons name="content-paste" size={18} color={colors.navy} />
          <Text style={styles.clipboardButtonText}>重新读取剪贴板</Text>
        </Pressable>
        <TextInput
          value={textValue}
          onChangeText={(value) => {
            setTextValue(value);
            setTextError(null);
          }}
          placeholder='在此粘贴 {"version":1,"products":[...],"logs":[...]}'
          placeholderTextColor={colors.muted}
          style={styles.textArea}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {textError ? <Text style={styles.error}>{textError}</Text> : null}
      </CenterCard>

      <CenterCard
        visible={pending !== null}
        title="确认导入数据库？"
        description={
          pending
            ? `来源：${pending.source}\n包含 ${pending.productCount} 个商品、${pending.logCount} 条日志。`
            : undefined
        }
        confirmLabel="确认导入"
        confirmTone={importMode === 'replace' ? 'danger' : 'teal'}
        onCancel={() => setPending(null)}
        onConfirm={() => void handleConfirmImport()}
      >
        <View style={styles.modes}>
          <Pressable
            style={[styles.mode, importMode === 'merge' && styles.modeActive]}
            onPress={() => setImportMode('merge')}
          >
            <Text style={[styles.modeTitle, importMode === 'merge' && styles.modeTitleActive]}>合并</Text>
            <Text style={styles.modeText}>保留本机记录，按商品合并条码与库存。</Text>
          </Pressable>
          <Pressable
            style={[styles.mode, importMode === 'replace' && styles.modeDanger]}
            onPress={() => setImportMode('replace')}
          >
            <Text style={[styles.modeTitle, importMode === 'replace' && styles.modeDangerTitle]}>覆盖</Text>
            <Text style={styles.modeText}>用备份内容替换当前库存和日志。</Text>
          </Pressable>
        </View>
      </CenterCard>

      <CenterCard
        visible={askClear}
        title="清空数据库？"
        description="此操作不可逆，将永久删除所有库存商品和历史日志。"
        confirmLabel="确认清空"
        confirmTone="danger"
        confirmDisabled={clearInput !== CLEAR_CONFIRM_WORD}
        onCancel={closeClear}
        onConfirm={() => void handleConfirmClear()}
      >
        <View style={styles.warnBox}>
          <MaterialCommunityIcons name="alert-outline" size={18} color={colors.danger} />
          <Text style={styles.warnText}>建议先执行「导出数据库」备份，清空后本机数据无法找回。</Text>
        </View>
        <TextInput
          value={clearInput}
          onChangeText={setClearInput}
          placeholder="请输入 Yes 确认清空"
          placeholderTextColor={colors.muted}
          style={styles.confirmInput}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="done"
        />
        <Text style={styles.confirmHint}>区分大小写，需精准输入 {CLEAR_CONFIRM_WORD} 才能点击确认清空。</Text>
      </CenterCard>

      {toast ? <ToastBar message={toast} tone="success" bottom={24} /> : null}
    </View>
  );
}

type PillRowProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  soft: string;
  title: string;
  text?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
};

function PillRow({
  icon,
  color,
  soft,
  title,
  text,
  onPress,
  disabled = false,
  busy = false,
  compact = false,
}: PillRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.pill, compact && styles.pillCompact, pressed && styles.pillPressed]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={title}
    >
      <View style={[styles.pillIcon, compact && styles.pillIconCompact, { backgroundColor: soft }]}>
        <MaterialCommunityIcons name={icon} size={compact ? 19 : 22} color={color} />
      </View>
      <View style={styles.pillBody}>
        <Text style={[styles.pillTitle, compact && styles.pillTitleCompact, { color }]}>{title}</Text>
        {text ? <Text style={styles.pillText}>{text}</Text> : null}
      </View>
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <MaterialCommunityIcons name="chevron-right" size={compact ? 20 : 22} color={colors.muted} />
      )}
    </Pressable>
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
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  summary: {
    backgroundColor: colors.ink,
    borderRadius: 22,
    padding: 18,
    gap: 6,
  },
  summaryLabel: {
    color: '#D9CBB8',
    fontSize: 13,
    fontWeight: '700',
  },
  summaryValue: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
  summaryHint: {
    color: '#C8BEB0',
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    gap: 10,
  },
  rows: {
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 14,
    ...shadow,
  },
  pillCompact: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowOpacity: 0.04,
    elevation: 1,
  },
  pillPressed: {
    backgroundColor: colors.bg,
  },
  pillIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillIconCompact: {
    width: 32,
    height: 32,
    borderRadius: 11,
  },
  pillBody: {
    flex: 1,
    gap: 4,
  },
  pillTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  pillTitleCompact: {
    fontSize: 15,
  },
  pillText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.75,
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 8,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  snapshotLoading: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  hint: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  notice: {
    color: colors.ink,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    lineHeight: 20,
    borderWidth: 1,
    borderColor: colors.line,
  },
  clipboardButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.navySoft,
  },
  clipboardButtonText: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '800',
  },
  textArea: {
    marginTop: 10,
    height: 150,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    marginTop: 8,
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  modes: {
    marginTop: 16,
    gap: 10,
  },
  mode: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    backgroundColor: colors.bg,
  },
  modeActive: {
    borderColor: colors.teal,
    backgroundColor: colors.tealSoft,
  },
  modeDanger: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  modeTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  modeTitleActive: {
    color: colors.teal,
  },
  modeDangerTitle: {
    color: colors.danger,
  },
  modeText: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  warnBox: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.dangerSoft,
    borderRadius: 14,
    padding: 12,
  },
  warnText: {
    flex: 1,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  confirmInput: {
    marginTop: 12,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 15,
  },
  confirmHint: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
});
