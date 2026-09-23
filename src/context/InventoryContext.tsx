import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import {
  STORAGE_KEY,
  createId,
  emptyDatabase,
  findProductByBarcode,
  makeLog,
  mergeDatabases,
  parseDatabase,
  trimLogs,
} from '@/lib/database';
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
export type ImportResult = { ok: true; detail: string } | { ok: false; message: string };

type InventoryContextValue = {
  ready: boolean;
  products: Product[];
  logs: LogEntry[];
  findByBarcode: (barcode: string) => Product | undefined;
  inboundScan: (barcode: string) => Promise<InboundResult>;
  outboundScan: (barcode: string) => Promise<OutboundResult>;
  createProduct: (name: string, barcode: string) => Promise<CreateResult>;
  bindBarcode: (productId: string, barcode: string) => Promise<BindResult>;
  adjustStock: (productId: string, delta: number) => Promise<AdjustResult>;
  deleteProduct: (productId: string) => Promise<DeleteResult>;
  exportDatabase: () => Promise<InventoryDatabase>;
  importDatabase: (raw: string, mode: ImportMode) => Promise<ImportResult>;
  clearDatabase: () => Promise<void>;
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

function replaceProduct(products: Product[], index: number, product: Product): Product[] {
  const next = products.slice();
  next[index] = product;
  return next;
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  const snapshotRef = useRef<InventoryDatabase>(emptyDatabase());
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const [db, setDb] = useState<InventoryDatabase>(emptyDatabase());
  const [ready, setReady] = useState(false);
  const { products, logs } = db;

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!active || !raw) return;
        const parsed = parseDatabase(raw);
        if (!parsed) return;
        snapshotRef.current = parsed;
        setDb(parsed);
      } finally {
        if (active) setReady(true);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const commit = useCallback(<T,>(recipe: (current: InventoryDatabase) => CommitResult<T>): Promise<T> => {
    let resolveResult: (value: T) => void = () => undefined;
    let rejectResult: (reason: unknown) => void = () => undefined;
    const resultPromise = new Promise<T>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    queueRef.current = queueRef.current.then(async () => {
      const previous = snapshotRef.current;
      try {
        const { next, result } = recipe(previous);
        const trimmed: InventoryDatabase = {
          version: 1,
          products: next.products,
          logs: trimLogs(next.logs),
        };
        snapshotRef.current = trimmed;
        setDb(trimmed);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        resolveResult(result);
      } catch (error) {
        snapshotRef.current = previous;
        setDb(previous);
        rejectResult(error);
      }
    });

    return resultPromise;
  }, []);

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
    (name: string, barcode: string) =>
      commit<CreateResult>((current) => {
        const normalizedName = name.trim();
        const normalized = barcode.trim();
        if (!normalizedName || !normalized) return { next: current, result: { kind: 'invalid' as const } };
        if (findProductByBarcode(current.products, normalized)) {
          return { next: current, result: { kind: 'duplicate' as const } };
        }
        const now = Date.now();
        const product: Product = {
          id: createId(),
          name: normalizedName,
          stock: 1,
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
              makeLog('create', `新增商品「${product.name}」，条码 ${normalized}，初始库存 1`),
            ],
          },
          result: { kind: 'created' as const, product },
        };
      }),
    [commit],
  );

  const bindBarcode = useCallback(
    (productId: string, barcode: string) =>
      commit<BindResult>((current) => {
        const normalized = barcode.trim();
        const index = current.products.findIndex((product) => product.id === productId);
        if (index < 0 || !normalized) return { next: current, result: { kind: 'missing-product' as const } };
        const owner = findProductByBarcode(current.products, normalized);
        if (owner && owner.id !== productId) return { next: current, result: { kind: 'duplicate' as const } };
        const product = current.products[index];
        const alreadyBound = product.barcodes.includes(normalized);
        const updated: Product = {
          ...product,
          barcodes: alreadyBound ? product.barcodes : [...product.barcodes, normalized],
          stock: product.stock + 1,
          updatedAt: Date.now(),
        };
        const detail = alreadyBound
          ? `入库「${updated.name}」，条码 ${normalized}，库存 ${product.stock} → ${updated.stock}`
          : `商品「${updated.name}」绑定条码 ${normalized} 并入库 1 件，库存 ${product.stock} → ${updated.stock}`;
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

  const exportDatabase = useCallback(async () => {
    // 必须先把本次「导出」日志写进状态并落盘（commit 内部 await AsyncStorage.setItem），
    // 之后才返回快照给调用方打包成 JSON。这样导出的文件里必然包含它自己这条导出记录，
    // 备份数据自闭环、可完整还原。
    await commit<LogEntry>((current) => {
      const entry = makeLog(
        'export',
        `导出数据库，商品 ${current.products.length} 个，日志 ${current.logs.length + 1} 条`,
      );
      return { next: { ...current, logs: [...current.logs, entry] }, result: entry };
    });
    return snapshotRef.current;
  }, [commit]);

  const importDatabase = useCallback(
    (raw: string, mode: ImportMode) => {
      const parsed = parseDatabase(raw);
      if (!parsed) return Promise.resolve({ ok: false as const, message: '文件内容不是可识别的库存数据库' });
      return commit<ImportResult>((current) => {
        const base = mode === 'replace' ? { version: 1 as const, products: parsed.products, logs: parsed.logs } : mergeDatabases(current, parsed);
        const detail =
          mode === 'replace'
            ? `覆盖导入数据库，商品 ${base.products.length} 个，历史日志 ${base.logs.length} 条`
            : `合并导入数据库，商品 ${base.products.length} 个，日志 ${base.logs.length} 条`;
        const next = { ...base, logs: [...base.logs, makeLog('import', detail)] };
        return { next, result: { ok: true as const, detail } };
      });
    },
    [commit],
  );

  const clearDatabase = useCallback(async () => {
    // 高危不可逆操作：商品与日志一并重置为空，并把空库写回本地存储。
    // 这里刻意不追加日志，保证清空后确实是「全空」状态。
    await commit<null>(() => ({ next: emptyDatabase(), result: null }));
  }, [commit]);

  // 这里不做手动 memo：Provider 只会在 db / ready 变化时重渲染，
  // 而这正是 context 值必须更新的时机，手动 useMemo 没有实际收益。
  const value: InventoryContextValue = {
    ready,
    products,
    logs,
    findByBarcode,
    inboundScan,
    outboundScan,
    createProduct,
    bindBarcode,
    adjustStock,
    deleteProduct,
    exportDatabase,
    importDatabase,
    clearDatabase,
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory(): InventoryContextValue {
  const value = useContext(InventoryContext);
  if (!value) throw new Error('useInventory 必须在 InventoryProvider 内使用');
  return value;
}
