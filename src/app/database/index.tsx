import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenterCard } from '@/components/CenterCard';
import { PillRow } from '@/components/PillRow';
import { ToastBar, type ToastTone } from '@/components/ToastBar';
import { useInventory } from '@/context/InventoryContext';
import { listSnapshots, readPickedText, readSnapshotText, saveSnapshot, type Snapshot } from '@/lib/backup';
import { parseDatabase } from '@/lib/database';
import { latestActivity, validateDatabaseName, type DatabaseSummary } from '@/lib/databases';
import { formatTimestamp } from '@/lib/format';
import type { ImportMode, InventoryDatabase } from '@/lib/types';
import { colors, shadow } from '@/theme';

/** 重置全部数据库必须精准输入的确认词（区分大小写）。 */
const CLEAR_CONFIRM_WORD = 'Yes';

/** 「包含历史日志」卡片的琥珀色标识。 */
const LOG_ACCENT = '#D97706';
const LOG_ACCENT_SOFT = '#FEF3C7';

type BusyState = 'switch' | 'export' | 'clipboard' | 'import' | 'name' | 'delete' | 'reset' | null;

/** 新建 / 修改名称两种用途共用同一个表单弹窗。 */
type NameDialog = { mode: 'create' } | { mode: 'rename'; entry: DatabaseSummary };

/** 已经读取并通过校验、等待用户确认的待导入数据。 */
type PendingImport = {
  source: string;
  raw: string;
  productCount: number;
  logCount: number;
};

/** 新建数据库时预导入的备份数据：只暂存在弹窗里，点「确认创建」时才随新库一起落盘。 */
type PreImport = {
  data: InventoryDatabase;
  /** 备份里最后一条商品/日志的时间，用于展示统计。 */
  updatedAt: number;
};

type ToastState = {
  message: string;
  tone: ToastTone;
  /** 副标题，用于承载导入统计等补充信息。 */
  actionHint?: string;
};

export default function DatabaseScreen() {
  const {
    databases,
    activeDatabaseId,
    refreshDatabases,
    switchDatabase,
    createDatabase,
    renameDatabase,
    deleteDatabase,
    resetDatabases,
    exportDatabase,
    importDatabase,
  } = useInventory();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  /** 同一时刻只保留一行处于滑开状态。 */
  const openRow = useRef<Swipeable | null>(null);

  /** 当前操作的数据库：导入、导出、删除严格只作用于它，避免误操作到别的库。 */
  const [target, setTarget] = useState<DatabaseSummary | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  /** 导出时是否携带历史日志，关闭后只导出商品库存。每次打开弹窗都会重置为开启。 */
  const [includeLogs, setIncludeLogs] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [askDelete, setAskDelete] = useState(false);
  const [askReset, setAskReset] = useState(false);
  const [resetInput, setResetInput] = useState('');

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  /** 新建弹窗里的预导入数据：非空即代表已导入成功。 */
  const [preImport, setPreImport] = useState<PreImport | null>(null);
  /** 导入通道当前服务于哪条流程：给已有库导入，还是给新建库预导入。 */
  const [importPurpose, setImportPurpose] = useState<'database' | 'preload'>('database');
  /**
   * 卡片实测高度。Swipeable 容器会把溢出内容裁掉（阴影因此需要留白），
   * 所以滑动按钮改用这个实测高度，保证与卡片上下边缘严丝合缝。
   */
  const [cardHeight, setCardHeight] = useState(0);
  const [busy, setBusy] = useState<BusyState>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    // 成功提示短暂停留即可；失败/提示类信息停留更久以确保能看清。
    const timer = setTimeout(() => setToast(null), toast.tone === 'success' ? 2400 : 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      void refreshDatabases();
    }, [refreshDatabases]),
  );

  /** 名称实时校验：空输入只让确认按钮不可点，非法字符与重名才展示错误行。 */
  const nameCheck = useMemo(
    () =>
      validateDatabaseName(
        nameValue,
        databases,
        nameDialog?.mode === 'rename' ? nameDialog.entry.id : undefined,
      ),
    [nameValue, databases, nameDialog],
  );
  const nameError = !nameCheck.ok && nameCheck.reason !== 'empty' ? `错误：${nameCheck.message}` : null;

  const showToast = (message: string, tone: ToastTone, actionHint?: string) => {
    setToast({ message, tone, actionHint });
  };

  const showResult = (result: { ok: boolean; message: string }) => {
    showToast(result.message, result.ok ? 'success' : 'warning');
  };

  const refreshSnapshots = useCallback(async (databaseId: string) => {
    setSnapshotsLoading(true);
    try {
      setSnapshots(await listSnapshots(databaseId));
    } catch {
      setSnapshots([]);
    } finally {
      setSnapshotsLoading(false);
    }
  }, []);

  /** 关闭某个库的操作弹窗并解除目标绑定。 */
  const closeTarget = () => {
    setExportOpen(false);
    setImportOpen(false);
    setTextOpen(false);
    setPending(null);
    setAskDelete(false);
    setTarget(null);
  };

  const handleSwitch = async (entry: DatabaseSummary) => {
    if (busy) return;
    if (entry.id === activeDatabaseId) {
      showToast('当前正在使用该数据库', 'info');
      return;
    }
    setBusy('switch');
    setToast(null);
    try {
      const result = await switchDatabase(entry.id);
      showResult(result);
      if (result.ok) await refreshDatabases();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换失败', 'warning');
    } finally {
      setBusy(null);
    }
  };

  const openCreate = () => {
    setToast(null);
    setNameValue('');
    // 每次打开都从「未预导入」开始，避免上一轮的备份被默默沿用。
    setPreImport(null);
    setNameDialog({ mode: 'create' });
  };

  const openRename = (entry: DatabaseSummary) => {
    setToast(null);
    setNameValue(entry.name);
    setNameDialog({ mode: 'rename', entry });
  };

  const handleConfirmName = async () => {
    const dialog = nameDialog;
    if (!dialog || !nameCheck.ok || busy) return;
    setNameDialog(null);
    setBusy('name');
    setToast(null);
    try {
      const result =
        dialog.mode === 'create'
          ? // 有预导入就把它作为新库的初始数据，否则建空库。
            await createDatabase(nameCheck.name, preImport?.data)
          : await renameDatabase(dialog.entry.id, nameCheck.name);
      showResult(result);
      if (result.ok) await refreshDatabases();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'warning');
    } finally {
      setBusy(null);
    }
  };

  const openExport = (entry: DatabaseSummary) => {
    setToast(null);
    // 每次打开都回到默认的「包含日志」，避免上次的选择被默默沿用。
    setIncludeLogs(true);
    setTarget(entry);
    setExportOpen(true);
    void refreshSnapshots(entry.id);
  };

  /** 导出前的统一时序：先提交「导出」日志并落盘，拿到持久化后的完整快照，再静默留存本机快照。 */
  const buildExportText = useCallback(
    async (entry: DatabaseSummary) => {
      const snapshot = await exportDatabase(includeLogs, entry.id);
      const text = JSON.stringify(snapshot, null, 2);
      try {
        saveSnapshot(entry.id, snapshot);
        setSnapshots(await listSnapshots(entry.id));
      } catch {
        showToast('数据库已生成，但本机快照保存失败。', 'warning');
      }
      return text;
    },
    [exportDatabase, includeLogs],
  );

  const handleShareExport = async () => {
    const entry = target;
    if (!entry || busy) return;
    setBusy('export');
    setToast(null);
    try {
      const text = await buildExportText(entry);
      const file = new File(Paths.cache, `inventory-${Date.now()}.json`);
      file.write(text);
      if (!(await Sharing.isAvailableAsync())) {
        showToast('本机不支持系统分享，可改用「复制 JSON 到剪贴板」。', 'info');
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: `导出数据库：${entry.name}`,
        UTI: 'public.json',
      });
      closeTarget();
      showToast(`已导出数据库：${entry.name}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出失败', 'warning');
    } finally {
      setBusy(null);
    }
  };

  const handleCopyExport = async () => {
    const entry = target;
    if (!entry || busy) return;
    setBusy('clipboard');
    setToast(null);
    try {
      await Clipboard.setStringAsync(await buildExportText(entry));
      closeTarget();
      showToast(`已复制「${entry.name}」的备份数据到剪贴板`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制失败', 'warning');
    } finally {
      setBusy(null);
    }
  };

  const openImport = (entry: DatabaseSummary) => {
    setToast(null);
    setImportPurpose('database');
    setTarget(entry);
    setImportOpen(true);
    void refreshSnapshots(entry.id);
  };

  /** 新建数据库弹窗里的预导入入口：只读取备份，不写入任何数据库。 */
  const openPreload = () => {
    setToast(null);
    setImportPurpose('preload');
    setImportOpen(true);
  };

  /**
   * 备份解析成功后按流程分流：
   * - 预导入（新建库）：只暂存到弹窗状态里，等「确认创建」时一起落盘；
   * - 正式导入：进入合并/覆盖的确认弹窗。
   */
  const acceptParsed = (source: string, raw: string, data: InventoryDatabase) => {
    if (importPurpose === 'preload') {
      setPreImport({ data, updatedAt: latestActivity(data, Date.now()) });
      setImportOpen(false);
      setTextOpen(false);
      return;
    }
    setPending({ source, raw, productCount: data.products.length, logCount: data.logs.length });
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
    acceptParsed('剪贴板文本', raw, parsed);
  };

  /** 入口 B：系统文件选择器。 */
  const handlePickFile = async () => {
    if (busy) return;
    setImportOpen(false);
    setBusy('import');
    setToast(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        // 放开类型限制，避免部分 ROM 因 MIME 过滤给出不可读的虚拟 URI。
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets[0]) {
        showToast('已取消选择文件。', 'info');
        return;
      }
      let text: string;
      try {
        text = await readPickedText(picked.assets[0].uri);
      } catch {
        showToast('无法读取所选文件。可改用「从剪贴板文本导入」或本机快照。', 'warning');
        return;
      }
      const parsed = parseDatabase(text);
      if (!parsed) {
        showToast('所选文件不是可识别的库存数据库。', 'warning');
        return;
      }
      acceptParsed(picked.assets[0].name ?? '本地文件', text, parsed);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入失败', 'warning');
    } finally {
      setBusy(null);
    }
  };

  /** 通道 C：本机快照，只展示当前这座数据库名下的快照。 */
  const handlePickSnapshot = async (snapshot: Snapshot) => {
    if (busy) return;
    setBusy('import');
    setToast(null);
    try {
      const text = await readSnapshotText(snapshot.uri);
      const parsed = parseDatabase(text);
      if (!parsed) {
        showToast('该快照已损坏，无法读取。', 'warning');
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
      showToast('读取快照失败。', 'warning');
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmImport = async () => {
    const current = pending;
    const entry = target;
    if (!current || !entry || busy) return;
    setPending(null);
    setBusy('import');
    setToast(null);
    try {
      const result = await importDatabase(current.raw, importMode, entry.id);
      if (result.ok) {
        // 成功只保留一条悬浮提示，统计信息作为副标题合并展示。
        showToast(
          `已导入数据库：${entry.name}`,
          'success',
          result.includeLogs
            ? `商品 ${result.productCount} 个 · 历史日志 ${result.logCount} 条`
            : `商品 ${result.productCount} 个 · 不含日志`,
        );
        void refreshDatabases();
        return;
      }
      showToast(result.message, 'warning');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入失败', 'warning');
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmDelete = async () => {
    const entry = target;
    if (!entry || busy) return;
    setAskDelete(false);
    setBusy('delete');
    setToast(null);
    try {
      const result = await deleteDatabase(entry.id);
      setTarget(null);
      // 被删掉的那一行会整行卸载，顺手清掉滑开状态引用。
      openRow.current = null;
      showResult(result);
      if (result.ok) await refreshDatabases();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除失败', 'warning');
    } finally {
      setBusy(null);
    }
  };

  const closeReset = () => {
    setResetInput('');
    setAskReset(false);
  };

  const handleConfirmReset = async () => {
    if (resetInput !== CLEAR_CONFIRM_WORD || busy) return;
    closeReset();
    setBusy('reset');
    setToast(null);
    try {
      await resetDatabases();
      openRow.current = null;
      showToast('已重置全部数据库', 'success');
      await refreshDatabases();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '重置失败', 'warning');
    } finally {
      setBusy(null);
    }
  };

  const onlyOne = databases.length <= 1;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          // 标题保持导航栏样式，同时做成可点区域：点标题平滑回到列表顶部。
          headerTitle: () => (
            <Pressable
              style={({ pressed }) => [styles.titleTap, pressed && styles.pressed]}
              onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
              accessibilityLabel="回到顶部"
            >
              <Text style={styles.headerTitle}>数据库管理</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
              onPress={openCreate}
              accessibilityLabel="新建数据库"
            >
              <MaterialCommunityIcons name="plus" size={22} color={colors.green} />
            </Pressable>
          ),
        }}
      />

      <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>本机数据库</Text>

        {databases.map((item) => {
          const active = item.id === activeDatabaseId;
          // 当前使用的库用主题绿高亮，其余用中性灰，一眼分辨。
          const accent = active ? colors.green : colors.muted;
          const soft = active ? colors.greenSoft : colors.line;
          return (
            <Swipeable
              key={item.id}
              // 容器会裁掉溢出内容，留出上下内边距给卡片阴影，避免阴影被削掉。
              containerStyle={styles.swipeRow}
              onSwipeableOpen={(_direction, swipeable) => {
                if (openRow.current && openRow.current !== swipeable) openRow.current.close();
                openRow.current = swipeable;
              }}
              // 向右滑动：左侧滑出「导入 / 导出」，只作用于这一座数据库。
              renderLeftActions={(_progress, _dragX, swipeable) => (
                <View style={styles.swipeActions}>
                  <SwipeAction
                    icon="database-import-outline"
                    label="导入数据库"
                    color={colors.green}
                    background={colors.greenSoft}
                    border={colors.green}
                    height={cardHeight}
                    onPress={() => {
                      swipeable.close();
                      openImport(item);
                    }}
                  />
                  <SwipeAction
                    icon="database-export-outline"
                    label="导出数据库"
                    color={colors.navy}
                    background={colors.navySoft}
                    border={colors.navy}
                    height={cardHeight}
                    onPress={() => {
                      swipeable.close();
                      openExport(item);
                    }}
                  />
                </View>
              )}
              // 向左滑动：右侧滑出「修改名称 / 删除数据库」。
              renderRightActions={(_progress, _dragX, swipeable) => (
                <View style={styles.swipeActions}>
                  <SwipeAction
                    icon="pencil-outline"
                    label="修改名称"
                    color={colors.navy}
                    background={colors.navySoft}
                    border={colors.navy}
                    height={cardHeight}
                    onPress={() => {
                      swipeable.close();
                      openRename(item);
                    }}
                  />
                  <SwipeAction
                    icon="trash-can-outline"
                    label="删除数据库"
                    color={colors.danger}
                    background={colors.dangerSoft}
                    border={colors.danger}
                    height={cardHeight}
                    disabled={onlyOne}
                    onPress={() => {
                      swipeable.close();
                      if (onlyOne) {
                        showToast('至少需要保留一个数据库', 'warning');
                        return;
                      }
                      setTarget(item);
                      setAskDelete(true);
                    }}
                  />
                </View>
              )}
            >
              <Pressable
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => void handleSwitch(item)}
                onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
                accessibilityLabel={`切换到数据库 ${item.name}`}
              >
                <View style={[styles.cardIcon, { backgroundColor: soft }]}>
                  <MaterialCommunityIcons name="database" size={22} color={accent} />
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardHead}>
                    <Text numberOfLines={1} style={[styles.cardTitle, { color: accent }]}>
                      {item.name}
                    </Text>
                    {active ? (
                      <View style={styles.activeBadge}>
                        <MaterialCommunityIcons name="check-circle" size={13} color={colors.green} />
                        <Text style={styles.activeText}>使用中</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardText}>
                    {`${item.productCount} 个商品 · ${item.logCount} 条日志 · 最后更新 ${formatTimestamp(item.updatedAt)}`}
                  </Text>
                </View>
              </Pressable>
            </Swipeable>
          );
        })}

        <Text style={styles.hint}>右滑卡片可导入或导出该库的备份，左滑可改名或删除。</Text>

        <Text style={styles.sectionTitle}>危险操作</Text>
        <Pressable
          style={({ pressed }) => [styles.card, styles.cardOffset, pressed && styles.cardPressed]}
          onPress={() => {
            setResetInput('');
            setAskReset(true);
          }}
          accessibilityLabel="重置所有数据库"
        >
          <View style={[styles.cardIcon, { backgroundColor: colors.dangerSoft }]}>
            <MaterialCommunityIcons name="database-remove-outline" size={22} color={colors.danger} />
          </View>
          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, { color: colors.danger }]}>重置所有数据库</Text>
            <Text style={styles.cardText}>清空本机保存的所有数据库，不可恢复。</Text>
          </View>
        </Pressable>
      </ScrollView>

      <CenterCard
        visible={nameDialog !== null}
        title={nameDialog?.mode === 'create' ? '新建数据库' : '修改数据库名称'}
        description="仅支持中文、英文、数字及符号 . - _（英文不区分大小写）"
        confirmLabel={nameDialog?.mode === 'create' ? '确认创建' : '确认修改'}
        confirmTone={nameDialog?.mode === 'create' ? 'green' : 'navy'}
        confirmDisabled={!nameCheck.ok}
        cardMaxHeight="88%"
        // 新建弹窗里「输入框 → 按钮 → 导入入口」三层间距统一为 12。
        actionsSpacing={nameDialog?.mode === 'create' ? 12 : undefined}
        header={nameDialog?.mode === 'rename' ? <DatabaseBanner name={nameDialog.entry.name} /> : null}
        // 可选能力：不导入也能直接建空库，流程完全非阻塞。
        footer={
          nameDialog?.mode === 'create' ? (
            <PreloadCard preload={preImport} disabled={busy !== null} onPress={openPreload} />
          ) : null
        }
        onCancel={() => setNameDialog(null)}
        onConfirm={() => void handleConfirmName()}
      >
        <View style={[styles.inputRow, nameError ? styles.inputRowError : null]}>
          <TextInput
            value={nameValue}
            onChangeText={setNameValue}
            placeholder="输入数据库名称"
            placeholderTextColor={colors.muted}
            style={styles.nameInput}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
          />
          {nameValue.length > 0 ? (
            <Pressable
              style={({ pressed }) => [styles.inputClear, pressed && styles.pressed]}
              onPress={() => setNameValue('')}
              accessibilityLabel="清空输入"
            >
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        {nameError ? (
          <View style={styles.errorRow}>
            {/* 红色圆形底块 + 与弹窗同色的微型 × 图标 */}
            <View style={styles.errorDot}>
              <MaterialCommunityIcons name="close" size={12} color={colors.card} />
            </View>
            <Text style={styles.errorText}>{nameError}</Text>
          </View>
        ) : null}
      </CenterCard>

      <CenterCard
        visible={exportOpen}
        title="导出数据库"
        description="两种通道都会先写入导出日志，并在该数据库名下保留一份快照（最多 5 份）。"
        cancelLabel="关闭"
        showConfirm={false}
        showScrollIndicator
        cardMaxHeight="88%"
        header={target ? <DatabaseBanner name={target.name} /> : null}
        onCancel={closeTarget}
        onConfirm={closeTarget}
      >
        <View style={styles.rows}>
          <PillRow
            compact
            icon="file-document-outline"
            color={LOG_ACCENT}
            soft={LOG_ACCENT_SOFT}
            title="包含历史日志"
            text="开启备份全部流水；关闭仅备份当前库存"
            switchValue={includeLogs}
            disabled={busy !== null}
            onPress={() => setIncludeLogs((value) => !value)}
          />
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
        <Text style={styles.hint}>该库当前有 {snapshots.length} 份本机快照，导入时可直接还原。</Text>
      </CenterCard>

      <CenterCard
        visible={importOpen}
        title={importPurpose === 'preload' ? '导入备份数据' : '导入数据库'}
        description={
          importPurpose === 'preload'
            ? '选择一个通道读取备份，解析成功后填充到新建库。'
            : '选择恢复通道，读取成功后再确认导入方式。'
        }
        cancelLabel="关闭"
        showConfirm={false}
        showScrollIndicator
        cardMaxHeight="88%"
        header={target ? <DatabaseBanner name={target.name} /> : null}
        onCancel={closeTarget}
        onConfirm={closeTarget}
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

        {/* 预导入是为尚未创建的新库准备的，没有本机快照可言，这里不展示快照区。 */}
        {importPurpose === 'preload' ? null : (
          <>
            <Text style={styles.sectionTitle}>历史备份快照</Text>
            {snapshotsLoading ? (
              <View style={styles.snapshotLoading}>
                <ActivityIndicator color={colors.navy} />
              </View>
            ) : snapshots.length === 0 ? (
              <Text style={styles.hint}>该数据库还没有本机快照。每次成功导出都会自动生成一份。</Text>
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
                    text={
                      snapshot.includeLogs
                        ? `${snapshot.productCount} 个商品 · ${snapshot.logCount} 条日志`
                        : `${snapshot.productCount} 个商品 · 不含日志`
                    }
                    disabled={busy !== null}
                    onPress={() => void handlePickSnapshot(snapshot)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </CenterCard>

      <CenterCard
        visible={textOpen}
        title="粘贴备份数据"
        description="已尝试读取剪贴板。确认无误后校验并导入。"
        confirmLabel="校验并导入"
        confirmDisabled={textValue.trim().length === 0}
        header={target ? <DatabaseBanner name={target.name} /> : null}
        onCancel={closeTarget}
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
        {textError ? <Text style={styles.fieldError}>{textError}</Text> : null}
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
        header={target ? <DatabaseBanner name={target.name} /> : null}
        onCancel={closeTarget}
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
        visible={askDelete}
        title="删除数据库？"
        description="该数据库的商品与日志会从本机永久移除。"
        confirmLabel="确认删除"
        confirmTone="danger"
        header={target ? <DatabaseBanner name={target.name} /> : null}
        onCancel={closeTarget}
        onConfirm={() => void handleConfirmDelete()}
      >
        <View style={styles.warnBox}>
          <MaterialCommunityIcons name="alert-outline" size={18} color={colors.danger} />
          <Text style={styles.warnText}>
            该库名下的本机快照会一并清除，操作不可恢复。建议先右滑导出备份。
          </Text>
        </View>
      </CenterCard>

      <CenterCard
        visible={askReset}
        title="重置所有数据库？"
        description="此操作不可逆，将永久删除本机保存的所有数据库、商品与历史日志。"
        confirmLabel="确认重置"
        confirmTone="danger"
        confirmDisabled={resetInput !== CLEAR_CONFIRM_WORD}
        onCancel={closeReset}
        onConfirm={() => void handleConfirmReset()}
      >
        <View style={styles.warnBox}>
          <MaterialCommunityIcons name="alert-outline" size={18} color={colors.danger} />
          <Text style={styles.warnText}>重置后本机数据无法找回，建议先逐库导出备份。</Text>
        </View>
        <TextInput
          value={resetInput}
          onChangeText={setResetInput}
          placeholder="请输入 Yes 确认重置"
          placeholderTextColor={colors.muted}
          style={styles.confirmInput}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="done"
        />
        <Text style={styles.confirmHint}>区分大小写，需精准输入 {CLEAR_CONFIRM_WORD} 才能点击确认重置。</Text>
      </CenterCard>

      {toast ? (
        <ToastBar
          message={toast.message}
          tone={toast.tone}
          actionHint={toast.actionHint}
          bottom={insets.bottom + 24}
        />
      ) : null}
    </View>
  );
}

/** 弹窗顶部的操作对象提示，防止把 A 库的备份导进 B 库。 */
function DatabaseBanner({ name }: { name: string }) {
  return (
    <View style={styles.banner}>
      <MaterialCommunityIcons name="database" size={15} color={colors.green} />
      <Text numberOfLines={1} style={styles.bannerText}>{`当前操作数据库：【${name}】`}</Text>
    </View>
  );
}

type PreloadCardProps = {
  preload: PreImport | null;
  disabled: boolean;
  onPress: () => void;
};

/**
 * 新建数据库时的可选预导入入口：
 * 未导入为蓝色提示卡，导入成功后立刻转为绿色，并展示解析出的真实统计。
 */
function PreloadCard({ preload, disabled, onPress }: PreloadCardProps) {
  const ready = preload !== null;
  const accent = ready ? colors.green : colors.navy;
  const soft = ready ? colors.greenSoft : colors.navySoft;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.preloadCard,
        { backgroundColor: soft },
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={ready ? '重新导入备份数据' : '导入数据库'}
    >
      <View style={styles.preloadIcon}>
        <MaterialCommunityIcons
          // 空心圆圈内带对勾（本套字形里对应的名字是 check-circle-outline）
          name={ready ? 'check-circle-outline' : 'database-import-outline'}
          size={20}
          color={accent}
        />
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.preloadTitle, { color: accent }]}>
          {ready ? '导入成功' : '导入数据库'}
        </Text>
        {preload ? (
          <>
            <Text style={styles.cardText}>
              {`包含 ${preload.data.products.length} 个商品 · ${preload.data.logs.length} 条日志 · 最后更新 ${formatTimestamp(preload.updatedAt)}`}
            </Text>
            <Text style={styles.cardText}>再次点击可以重新导入</Text>
          </>
        ) : (
          <Text style={styles.cardText}>选择现有备份直接填充新建库（可选）</Text>
        )}
      </View>
    </Pressable>
  );
}

type SwipeActionProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  color: string;
  background: string;
  border?: string;
  /** 与数据库卡片对齐的高度（取卡片实测高度），保证上下边缘与卡片一致。 */
  height?: number;
  disabled?: boolean;
  onPress: () => void;
};

/** 数据库卡片滑出的操作按钮：浅色底 + 正色字 + 1px 描边。 */
function SwipeAction({
  icon,
  label,
  color,
  background,
  border,
  height = 0,
  disabled = false,
  onPress,
}: SwipeActionProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: background, borderColor: border ?? background },
        height > 0 ? { height } : null,
        pressed && styles.pressed,
        disabled && styles.actionDisabled,
      ]}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <MaterialCommunityIcons name={icon} size={19} color={color} />
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    // 左右各留 10，配合 swipeRow 的 6px 留白，卡片正好与页面 16px 边距对齐。
    paddingHorizontal: 10,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 6,
  },
  titleTap: {
    alignSelf: 'flex-start',
  },
  headerTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
  },
  headerButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.greenSoft,
  },
  /** 统一按下反馈：轻微下沉 + 透明淡出。 */
  pressed: {
    opacity: 0.5,
    transform: [{ scale: 0.96 }],
  },
  sectionTitle: {
    marginHorizontal: 6,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  card: {
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
  cardPressed: {
    backgroundColor: colors.bg,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  cardText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.greenSoft,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  activeText: {
    color: colors.green,
    fontSize: 11,
    fontWeight: '800',
  },
  hint: {
    marginHorizontal: 6,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  /** Swipeable 容器会裁掉溢出内容，四周都留出空间，卡片阴影才不会被切平。 */
  swipeRow: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  /** 不在 Swipeable 里的独立卡片（如「重置所有数据库」）需要手动对齐左右留白。 */
  cardOffset: {
    marginHorizontal: 6,
  },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    backgroundColor: colors.bg,
  },
  action: {
    width: 76,
    // 与数据库卡片保持同一圆角，滑动时视觉不割裂。
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '800',
  },
  actionDisabled: {
    opacity: 0.4,
  },
  rows: {
    gap: 8,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.greenSoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bannerText: {
    flex: 1,
    color: colors.green,
    fontSize: 12,
    fontWeight: '800',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
  },
  inputRowError: {
    borderColor: colors.danger,
  },
  nameInput: {
    flex: 1,
    height: '100%',
    color: colors.ink,
    fontSize: 15,
  },
  inputClear: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 「新建数据库」里可选的预导入入口：无描边，靠全 App 统一的悬浮阴影立起来。 */
  preloadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadow,
  },
  preloadIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  preloadTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // 红色圆形底块 + 与弹窗同色的微型 × 图标
  errorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  snapshotLoading: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  clipboardButton: {
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
  fieldError: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  modes: {
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
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
});
