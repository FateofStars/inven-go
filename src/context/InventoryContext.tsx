import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { clearSnapshots } from '@/lib/backup';
import {
  createId,
  emptyDatabase,
  findProductByBarcode,
  makeLog,
  mergeDatabases,
  parseDatabase,
  trimLogs,
} from '@/lib/database';
import {
  DEFAULT_DATABASE_ID,
  DEFAULT_DATABASE_NAME,
  dataKey,
  listSummaries,
  loadRegistry,
  persistRegistry,
  readDatabaseData,
  removeDatabaseData,
  summarize,
  validateDatabaseName,
  type DatabaseEntry,
  type DatabaseRegistry,
  type DatabaseSummary,
} from '@/lib/databases';
import type { ImportMode, InventoryDatabase, LogEntry, Product } from '@/lib/types';

type CommitResult<T> = { next: InventoryDatabase; result: T };

export type InboundResult = { kind: 'updated'; product: Product } | { kind: 'missing' };
export type OutboundResult = InboundResult | { kind: 'empty'; name: string };
export type CreateResult = { kind: 'created'; product: Product } | { kind: 'duplicate' } | { kind: 'invalid' };
export type BindResult =
  | { kind: 'bound' | 'updated'; product: Product }
  | { kind: 'duplicate' }
  | { kind: 'missing-product' };
export type AdjustResult = { ok: true; product: Product } | { ok: false; message: string };
export type DeleteResult = { ok: true } | { ok: false; message: string };
export type ImportResult =
  | {
      ok: true;
      detail: string;
      /** 导入后数据库的商品数，用于在提示里展示统计。 */
      productCount: number;
      /** 导入后数据库的日志数。 */
      logCount: number;
      /** 导入包是否携带完整日志；不含日志的包在提示里展示为「不含日志」。 */
      includeLogs: boolean;
    }
  | { ok: false; message: string };

/**
 * 条码绑定关系的变更结果。
 * - `duplicate`：该条码已被**其他**商品占用
 * - `exists`：该条码已经是**本商品**的条码
 * - `last-barcode`：商品仅剩一个条码，不允许删除
 */
export type BarcodeOpResult =
  | { kind: 'ok'; product: Product }
  | { kind: 'duplicate'; owner: string }
  | { kind: 'exists' }
  | { kind: 'last-barcode' }
  | { kind: 'not-found' }
  | { kind: 'invalid' };

/** 数据库管理类操作（新建 / 改名 / 切换 / 删除）的统一返回。 */
export type DatabaseOpResult = { ok: true; message: string } | { ok: false; message: string };

type InventoryContextValue = {
  ready: boolean;
  products: Product[];
  logs: LogEntry[];
  /** 本机全部数据库的汇总信息；激活库的统计始终取自内存中的实时数据。 */
  databases: DatabaseSummary[];
  activeDatabaseId: string;
  /** 重新读取各数据库的商品数、日志数与最后更新时间。 */
  refreshDatabases: () => Promise<void>;
  switchDatabase: (id: string) => Promise<DatabaseOpResult>;
  createDatabase: (name: string, initialData?: InventoryDatabase) => Promise<DatabaseOpResult>;
  renameDatabase: (id: string, name: string) => Promise<DatabaseOpResult>;
  deleteDatabase: (id: string) => Promise<DatabaseOpResult>;
  /** 清空本机全部数据库及其快照，并重建一个空的默认数据库。 */
  resetDatabases: () => Promise<void>;
  findByBarcode: (barcode: string) => Product | undefined;
  inboundScan: (barcode: string) => Promise<InboundResult>;
  outboundScan: (barcode: string) => Promise<OutboundResult>;
  createProduct: (name: string, barcode: string, quantity?: number) => Promise<CreateResult>;
  bindBarcode: (productId: string, barcode: string, quantity?: number) => Promise<BindResult>;
  /** 只调整绑定关系，不改动库存。 */
  addBarcode: (productId: string, barcode: string) => Promise<BarcodeOpResult>;
  replaceBarcode: (productId: string, previous: string, next: string) => Promise<BarcodeOpResult>;
  removeBarcode: (productId: string, barcode: string) => Promise<BarcodeOpResult>;
  adjustStock: (productId: string, delta: number) => Promise<AdjustResult>;
  deleteProduct: (productId: string) => Promise<DeleteResult>;
  /** 置顶 / 取消置顶；置顶时自动排到置顶区域末尾。 */
  setPinned: (productId: string, pinned: boolean) => Promise<void>;
  /** 按传入顺序重写置顶商品的 pinOrder，用于长按拖拽排序后落盘。 */
  reorderPinned: (orderedIds: string[]) => Promise<void>;
  /** 导出指定数据库（默认当前激活库）的数据包。 */
  exportDatabase: (includeLogs?: boolean, databaseId?: string) => Promise<InventoryDatabase>;
  /** 把备份导入指定数据库（默认当前激活库）。 */
  importDatabase: (raw: string, mode: ImportMode, databaseId?: string) => Promise<ImportResult>;
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

function replaceProduct(products: Product[], index: number, product: Product): Product[] {
  const next = products.slice();
  next[index] = product;
  return next;
}

/** 入库数量的兜底：非有限数、非整数或小于 1 时一律按 1 件处理。 */
function normalizeQuantity(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  const floored = Math.floor(value);
  return floored >= 1 ? floored : 1;
}

/** 注册表尚未加载完成时的占位值（配合根组件的 ready 加载态，界面不会用到它）。 */
const EMPTY_REGISTRY: DatabaseRegistry = { version: 1, activeId: DEFAULT_DATABASE_ID, items: [] };

export function InventoryProvider({ children }: { children: ReactNode }) {
  const snapshotRef = useRef<InventoryDatabase>(emptyDatabase());
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const registryRef = useRef<DatabaseRegistry>(EMPTY_REGISTRY);
  const [registry, setRegistry] = useState<DatabaseRegistry>(EMPTY_REGISTRY);
  const [summaries, setSummaries] = useState<DatabaseSummary[]>([]);
  const [db, setDb] = useState<InventoryDatabase>(emptyDatabase());
  const [ready, setReady] = useState(false);
  const { products, logs } = db;

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        // 升级后的第一次启动会在这里把旧版单库数据封装成「默认数据库」。
        const loaded = await loadRegistry();
        if (!active) return;
        const data = await readDatabaseData(loaded.activeId);
        if (!active) return;
        registryRef.current = loaded;
        snapshotRef.current = data;
        setRegistry(loaded);
        setDb(data);
        setSummaries(await listSummaries(loaded));
      } finally {
        if (active) setReady(true);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  /** 把任务串到同一条队列上，保证「读 → 改 → 写」不会被并发交叉。 */
  const runExclusive = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.then(task, task);
    queueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  /**
   * 对指定数据库执行一次「读 → 改 → 写」。
   * - 目标就是当前激活库时直接用内存数据，并同步刷新界面；
   * - 目标是其他库时先从存储里读出来，写完只落盘、不打扰当前界面，
   *   这样「对某座库导入/导出」不会影响正在使用的库。
   */
  const commitTo = useCallback(
    <T,>(databaseId: string, recipe: (current: InventoryDatabase) => CommitResult<T>) =>
      runExclusive(async () => {
        const isActive = databaseId === registryRef.current.activeId;
        const previous = isActive ? snapshotRef.current : null;
        try {
          const current = previous ?? (await readDatabaseData(databaseId));
          const { next, result } = recipe(current);
          const trimmed: InventoryDatabase = {
            version: 1,
            products: next.products,
            logs: trimLogs(next.logs),
          };
          await AsyncStorage.setItem(dataKey(databaseId), JSON.stringify(trimmed));
          if (isActive) {
            snapshotRef.current = trimmed;
            setDb(trimmed);
          }
          return { result, next: trimmed };
        } catch (error) {
          if (previous) {
            snapshotRef.current = previous;
            setDb(previous);
          }
          throw error;
        }
      }),
    [runExclusive],
  );

  /** 对当前激活库的「读 → 改 → 写」，库存相关的全部操作都走这里。 */
  const commit = useCallback(
    <T,>(recipe: (current: InventoryDatabase) => CommitResult<T>): Promise<T> =>
      commitTo(registryRef.current.activeId, recipe).then((outcome) => outcome.result),
    [commitTo],
  );

  const findByBarcode = useCallback(
    (barcode: string) => findProductByBarcode(db.products, barcode),
    [db.products],
  );

  const inboundScan = useCallback(
    (barcode: string) =>
      commit<InboundResult>((current) => {
        const normalized = barcode.trim();
        const index = current.products.findIndex((product) => product.barcodes.includes(normalized));
        if (index < 0) return { next: current, result: { kind: 'missing' as const } };
        const product = current.products[index];
        const updated: Product = { ...product, stock: product.stock + 1, updatedAt: Date.now() };
        return {
          next: {
            ...current,
            products: replaceProduct(current.products, index, updated),
            logs: [
              ...current.logs,
              makeLog('inbound', `入库「${updated.name}」，条码 ${normalized}，库存 ${product.stock} → ${updated.stock}`),
            ],
          },
          result: { kind: 'updated' as const, product: updated },
        };
      }),
    [commit],
  );

  const outboundScan = useCallback(
    (barcode: string) =>
      commit<OutboundResult>((current) => {
        const normalized = barcode.trim();
        const index = current.products.findIndex((product) => product.barcodes.includes(normalized));
        if (index < 0) return { next: current, result: { kind: 'missing' as const } };
        const product = current.products[index];
        if (product.stock <= 0) return { next: current, result: { kind: 'empty' as const, name: product.name } };
        const updated: Product = { ...product, stock: product.stock - 1, updatedAt: Date.now() };
        return {
          next: {
            ...current,
            products: replaceProduct(current.products, index, updated),
            logs: [
              ...current.logs,
              makeLog('outbound', `出库「${updated.name}」，条码 ${normalized}，库存 ${product.stock} → ${updated.stock}`),
            ],
          },
          result: { kind: 'updated' as const, product: updated },
        };
      }),
    [commit],
  );

  const createProduct = useCallback(
    (name: string, barcode: string, quantity?: number) =>
      commit<CreateResult>((current) => {
        const normalizedName = name.trim();
        const normalized = barcode.trim();
        if (!normalizedName || !normalized) return { next: current, result: { kind: 'invalid' as const } };
        if (findProductByBarcode(current.products, normalized)) {
          return { next: current, result: { kind: 'duplicate' as const } };
        }
        const amount = normalizeQuantity(quantity);
        const now = Date.now();
        const product: Product = {
          id: createId(),
          name: normalizedName,
          stock: amount,
          barcodes: [normalized],
          createdAt: now,
          updatedAt: now,
        };
        return {
          next: {
            ...current,
            products: [product, ...current.products],
            logs: [
              ...current.logs,
              makeLog('create', `新增商品「${product.name}」，条码 ${normalized}，初始库存 ${amount}`),
            ],
          },
          result: { kind: 'created' as const, product },
        };
      }),
    [commit],
  );

  const bindBarcode = useCallback(
    (productId: string, barcode: string, quantity?: number) =>
      commit<BindResult>((current) => {
        const normalized = barcode.trim();
        const index = current.products.findIndex((product) => product.id === productId);
        if (index < 0 || !normalized) return { next: current, result: { kind: 'missing-product' as const } };
        const owner = findProductByBarcode(current.products, normalized);
        if (owner && owner.id !== productId) return { next: current, result: { kind: 'duplicate' as const } };
        const product = current.products[index];
        const alreadyBound = product.barcodes.includes(normalized);
        const amount = normalizeQuantity(quantity);
        const updated: Product = {
          ...product,
          barcodes: alreadyBound ? product.barcodes : [...product.barcodes, normalized],
          stock: product.stock + amount,
          updatedAt: Date.now(),
        };
        const detail = alreadyBound
          ? `入库「${updated.name}」，条码 ${normalized}，库存 ${product.stock} → ${updated.stock}`
          : `商品「${updated.name}」绑定条码 ${normalized} 并入库 ${amount} 件，库存 ${product.stock} → ${updated.stock}`;
        return {
          next: {
            ...current,
            products: replaceProduct(current.products, index, updated),
            logs: [...current.logs, makeLog('inbound', detail)],
          },
          result: { kind: alreadyBound ? ('updated' as const) : ('bound' as const), product: updated },
        };
      }),
    [commit],
  );

  /** 只追加绑定关系，不改动库存（用于商品详情页手工维护条码）。 */
  const addBarcode = useCallback(
    (productId: string, barcode: string) =>
      commit<BarcodeOpResult>((current) => {
        const normalized = barcode.trim();
        if (!normalized) return { next: current, result: { kind: 'invalid' as const } };
        const index = current.products.findIndex((product) => product.id === productId);
        if (index < 0) return { next: current, result: { kind: 'not-found' as const } };
        const owner = findProductByBarcode(current.products, normalized);
        if (owner && owner.id !== productId) {
          return { next: current, result: { kind: 'duplicate' as const, owner: owner.name } };
        }
        const product = current.products[index];
        if (product.barcodes.includes(normalized)) return { next: current, result: { kind: 'exists' as const } };
        const updated: Product = {
          ...product,
          barcodes: [...product.barcodes, normalized],
          updatedAt: Date.now(),
        };
        return {
          next: {
            ...current,
            products: replaceProduct(current.products, index, updated),
            logs: [...current.logs, makeLog('barcode', `更新商品绑定条码：「${updated.name}」新增条码 ${normalized}`)],
          },
          result: { kind: 'ok' as const, product: updated },
        };
      }),
    [commit],
  );

  const replaceBarcode = useCallback(
    (productId: string, previous: string, replacement: string) =>
      commit<BarcodeOpResult>((current) => {
        const from = previous.trim();
        const to = replacement.trim();
        if (!to) return { next: current, result: { kind: 'invalid' as const } };
        const index = current.products.findIndex((product) => product.id === productId);
        if (index < 0) return { next: current, result: { kind: 'not-found' as const } };
        const product = current.products[index];
        if (!product.barcodes.includes(from)) return { next: current, result: { kind: 'not-found' as const } };
        if (from === to) return { next: current, result: { kind: 'exists' as const } };
        const owner = findProductByBarcode(current.products, to);
        if (owner && owner.id !== productId) {
          return { next: current, result: { kind: 'duplicate' as const, owner: owner.name } };
        }
        const updated: Product = {
          ...product,
          barcodes: product.barcodes.map((code) => (code === from ? to : code)),
          updatedAt: Date.now(),
        };
        return {
          next: {
            ...current,
            products: replaceProduct(current.products, index, updated),
            logs: [...current.logs, makeLog('barcode', `更新商品绑定条码：「${updated.name}」将 ${from} 修改为 ${to}`)],
          },
          result: { kind: 'ok' as const, product: updated },
        };
      }),
    [commit],
  );

  const removeBarcode = useCallback(
    (productId: string, barcode: string) =>
      commit<BarcodeOpResult>((current) => {
        const normalized = barcode.trim();
        const index = current.products.findIndex((product) => product.id === productId);
        if (index < 0) return { next: current, result: { kind: 'not-found' as const } };
        const product = current.products[index];
        if (!product.barcodes.includes(normalized)) return { next: current, result: { kind: 'not-found' as const } };
        // 防呆：商品至少保留一个条码，否则它将无法再被任何扫描命中。
        if (product.barcodes.length <= 1) return { next: current, result: { kind: 'last-barcode' as const } };
        const updated: Product = {
          ...product,
          barcodes: product.barcodes.filter((code) => code !== normalized),
          updatedAt: Date.now(),
        };
        return {
          next: {
            ...current,
            products: replaceProduct(current.products, index, updated),
            logs: [...current.logs, makeLog('barcode', `更新商品绑定条码：「${updated.name}」删除条码 ${normalized}`)],
          },
          result: { kind: 'ok' as const, product: updated },
        };
      }),
    [commit],
  );

  const adjustStock = useCallback(
    (productId: string, delta: number) =>
      commit<AdjustResult>((current) => {
        if (!Number.isFinite(delta) || delta === 0) {
          return { next: current, result: { ok: false as const, message: '请输入大于 0 的整数' } };
        }
        const index = current.products.findIndex((product) => product.id === productId);
        if (index < 0) return { next: current, result: { ok: false as const, message: '商品不存在' } };
        const product = current.products[index];
        const applied = Math.max(-product.stock, delta);
        if (applied === 0) return { next: current, result: { ok: false as const, message: '库存已为 0，无法继续减少' } };
        const updated: Product = { ...product, stock: product.stock + applied, updatedAt: Date.now() };
        const amount = Math.abs(applied);
        const detail =
          applied > 0
            ? `手动入库「${updated.name}」${amount} 件，库存 ${product.stock} → ${updated.stock}`
            : `手动出库「${updated.name}」${amount} 件，库存 ${product.stock} → ${updated.stock}`;
        return {
          next: {
            ...current,
            products: replaceProduct(current.products, index, updated),
            logs: [...current.logs, makeLog(applied > 0 ? 'inbound' : 'outbound', detail)],
          },
          result: { ok: true as const, product: updated },
        };
      }),
    [commit],
  );

  const deleteProduct = useCallback(
    (productId: string) =>
      commit<DeleteResult>((current) => {
        const product = current.products.find((item) => item.id === productId);
        if (!product) return { next: current, result: { ok: false as const, message: '商品不存在' } };
        const codes = product.barcodes.length > 0 ? product.barcodes.join('、') : '无';
        return {
          next: {
            ...current,
            products: current.products.filter((item) => item.id !== productId),
            logs: [
              ...current.logs,
              makeLog('delete', `删除商品「${product.name}」，条码 ${codes}，删除前库存 ${product.stock}`),
            ],
          },
          result: { ok: true as const },
        };
      }),
    [commit],
  );

  const setPinned = useCallback(
    (productId: string, pinned: boolean) =>
      commit<void>((current) => {
        const index = current.products.findIndex((item) => item.id === productId);
        if (index < 0) return { next: current, result: undefined };
        const product = current.products[index];
        if (Boolean(product.isPinned) === pinned) return { next: current, result: undefined };
        // 新置顶的商品排在现有置顶区域末尾；取消置顶则清掉排序索引。
        const pinOrder = pinned
          ? current.products.reduce((max, item) => (item.isPinned ? Math.max(max, item.pinOrder ?? 0) : max), -1) + 1
          : undefined;
        const updated: Product = { ...product, isPinned: pinned, pinOrder, updatedAt: Date.now() };
        return {
          next: { ...current, products: replaceProduct(current.products, index, updated) },
          result: undefined,
        };
      }),
    [commit],
  );

  const reorderPinned = useCallback(
    (orderedIds: string[]) =>
      commit<void>((current) => {
        const rank = new Map(orderedIds.map((id, index) => [id, index]));
        const products = current.products.map((product) => {
          if (!product.isPinned) return product;
          const order = rank.get(product.id);
          return order === undefined ? product : { ...product, pinOrder: order };
        });
        return { next: { ...current, products }, result: undefined };
      }),
    [commit],
  );

  const exportDatabase = useCallback(
    async (includeLogs = true, databaseId?: string): Promise<InventoryDatabase> => {
      // 必须先把本次「导出」日志写进状态并落盘（commitTo 内部 await AsyncStorage.setItem），
      // 之后才返回快照给调用方打包成 JSON。这样导出的文件里必然包含它自己这条导出记录，
      // 备份数据自闭环、可完整还原。
      // 关闭「包含日志」只影响导出的数据包，本机历史日志仍会照常保留、不被清空。
      const { result: entry, next } = await commitTo(
        databaseId ?? registryRef.current.activeId,
        (current) => {
          const detail = includeLogs
            ? `导出数据库，商品 ${current.products.length} 个，日志 ${current.logs.length + 1} 条`
            : `导出数据库（不含日志），商品 ${current.products.length} 个`;
          const created = makeLog('export', detail);
          return { next: { ...current, logs: [...current.logs, created] }, result: created };
        },
      );
      if (includeLogs) {
        return { version: 1, products: next.products, logs: next.logs };
      }
      // 不含日志时只保留本次导出这一条记录，保证因果闭环又不夹带历史流水。
      return { version: 1, products: next.products, logs: [entry], includeLogs: false };
    },
    [commitTo],
  );

  const importDatabase = useCallback(
    (raw: string, mode: ImportMode, databaseId?: string) => {
      const parsed = parseDatabase(raw);
      if (!parsed) return Promise.resolve({ ok: false as const, message: '文件内容不是可识别的库存数据库' });
      return commitTo(databaseId ?? registryRef.current.activeId, (current) => {
        const base =
          mode === 'replace'
            ? { version: 1 as const, products: parsed.products, logs: parsed.logs }
            : mergeDatabases(current, parsed);
        const detail =
          mode === 'replace'
            ? `覆盖导入数据库，商品 ${base.products.length} 个，历史日志 ${base.logs.length} 条`
            : `合并导入数据库，商品 ${base.products.length} 个，日志 ${base.logs.length} 条`;
        const next = { ...base, logs: [...base.logs, makeLog('import', detail)] };
        return {
          next,
          result: {
            ok: true as const,
            detail,
            productCount: base.products.length,
            logCount: base.logs.length,
            includeLogs: parsed.includeLogs !== false,
          },
        };
      }).then((outcome) => outcome.result);
    },
    [commitTo],
  );

  const refreshDatabases = useCallback(async () => {
    setSummaries(await listSummaries(registryRef.current));
  }, []);

  const switchDatabase = useCallback(
    (id: string) =>
      runExclusive(async (): Promise<DatabaseOpResult> => {
        const current = registryRef.current;
        if (id === current.activeId) return { ok: true, message: '已经是当前使用的数据库' };
        const entry = current.items.find((item) => item.id === id);
        if (!entry) return { ok: false, message: '数据库不存在' };
        const data = await readDatabaseData(id);
        const next: DatabaseRegistry = { ...current, activeId: id };
        await persistRegistry(next);
        registryRef.current = next;
        snapshotRef.current = data;
        setRegistry(next);
        setDb(data);
        return { ok: true, message: `已切换至数据库：${entry.name}` };
      }),
    [runExclusive],
  );

  const createDatabase = useCallback(
    (name: string, initialData?: InventoryDatabase) =>
      runExclusive(async (): Promise<DatabaseOpResult> => {
        const current = registryRef.current;
        const check = validateDatabaseName(name, current.items);
        if (!check.ok) return { ok: false, message: check.message };
        const entry: DatabaseEntry = { id: createId(), name: check.name, createdAt: Date.now() };
        // 传了初始数据（新建时的预导入）就以它作为新库的起点，否则建一个空库。
        const data: InventoryDatabase = initialData
          ? { version: 1, products: initialData.products, logs: trimLogs(initialData.logs) }
          : emptyDatabase();
        await AsyncStorage.setItem(dataKey(entry.id), JSON.stringify(data));
        const next: DatabaseRegistry = { ...current, items: [...current.items, entry] };
        await persistRegistry(next);
        registryRef.current = next;
        setRegistry(next);
        setSummaries((list) => [...list, summarize(entry, data)]);
        return { ok: true, message: `已创建数据库：${entry.name}` };
      }),
    [runExclusive],
  );

  const renameDatabase = useCallback(
    (id: string, name: string) =>
      runExclusive(async (): Promise<DatabaseOpResult> => {
        const current = registryRef.current;
        const entry = current.items.find((item) => item.id === id);
        if (!entry) return { ok: false, message: '数据库不存在' };
        // 允许与自身同名，只拦截与其他库的重名（英文不区分大小写）。
        const check = validateDatabaseName(name, current.items, id);
        if (!check.ok) return { ok: false, message: check.message };
        const next: DatabaseRegistry = {
          ...current,
          items: current.items.map((item) => (item.id === id ? { ...item, name: check.name } : item)),
        };
        await persistRegistry(next);
        registryRef.current = next;
        setRegistry(next);
        setSummaries((list) => list.map((item) => (item.id === id ? { ...item, name: check.name } : item)));
        return { ok: true, message: `已重命名为：${check.name}` };
      }),
    [runExclusive],
  );

  const deleteDatabase = useCallback(
    (id: string) =>
      runExclusive(async (): Promise<DatabaseOpResult> => {
        const current = registryRef.current;
        if (current.items.length <= 1) return { ok: false, message: '至少需要保留一个数据库' };
        const entry = current.items.find((item) => item.id === id);
        if (!entry) return { ok: false, message: '数据库不存在' };

        const rest = current.items.filter((item) => item.id !== id);
        // 删掉正在使用的库时自动切到「默认数据库」，默认库已不在则退回列表中的第一个。
        const fallback = rest.find((item) => item.id === DEFAULT_DATABASE_ID) ?? rest[0];
        const wasActive = current.activeId === id;
        const next: DatabaseRegistry = {
          version: 1,
          activeId: wasActive ? fallback.id : current.activeId,
          items: rest,
        };
        await persistRegistry(next);
        await removeDatabaseData(id);
        // 该库自己的本机快照一并清理，不留孤儿文件。
        clearSnapshots(id);
        registryRef.current = next;
        setRegistry(next);
        if (wasActive) {
          const data = await readDatabaseData(fallback.id);
          snapshotRef.current = data;
          setDb(data);
        }
        setSummaries(await listSummaries(next));
        return { ok: true, message: `已删除数据库：${entry.name}` };
      }),
    [runExclusive],
  );

  const resetDatabases = useCallback(
    () =>
      runExclusive(async () => {
        // 高危不可逆操作：清掉全部数据库的数据与快照，再重建一个空的默认数据库，
        // 保证任何时刻都至少有一个可用库。这里刻意不追加日志，让重置后确实是「全空」状态。
        for (const item of registryRef.current.items) {
          await removeDatabaseData(item.id);
          clearSnapshots(item.id);
        }
        const entry: DatabaseEntry = {
          id: DEFAULT_DATABASE_ID,
          name: DEFAULT_DATABASE_NAME,
          createdAt: Date.now(),
        };
        const data = emptyDatabase();
        await AsyncStorage.setItem(dataKey(entry.id), JSON.stringify(data));
        const next: DatabaseRegistry = { version: 1, activeId: entry.id, items: [entry] };
        await persistRegistry(next);
        registryRef.current = next;
        snapshotRef.current = data;
        setRegistry(next);
        setDb(data);
        setSummaries([summarize(entry, data)]);
      }),
    [runExclusive],
  );

  /** 激活库的统计直接取内存实时数据，避免管理页返回时看到过期数字。 */
  const databases = useMemo(
    () => summaries.map((item) => (item.id === registry.activeId ? summarize(item, db) : item)),
    [summaries, registry.activeId, db],
  );

  // 这里不做手动 memo：Provider 只会在 db / ready / 数据库列表变化时重渲染，
  // 而这正是 context 值必须更新的时机，手动 useMemo 没有实际收益。
  const value: InventoryContextValue = {
    ready,
    products,
    logs,
    databases,
    activeDatabaseId: registry.activeId,
    refreshDatabases,
    switchDatabase,
    createDatabase,
    renameDatabase,
    deleteDatabase,
    resetDatabases,
    findByBarcode,
    inboundScan,
    outboundScan,
    createProduct,
    bindBarcode,
    addBarcode,
    replaceBarcode,
    removeBarcode,
    adjustStock,
    deleteProduct,
    setPinned,
    reorderPinned,
    exportDatabase,
    importDatabase,
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory(): InventoryContextValue {
  const value = useContext(InventoryContext);
  if (!value) throw new Error('useInventory 必须在 InventoryProvider 内使用');
  return value;
}
