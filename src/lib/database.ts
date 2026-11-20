import { cleanBarcode } from '@/lib/barcodeFormat';
import type { InventoryDatabase, LogEntry, LogParams, LogType, Product, UndoInfo } from '@/lib/types';

export const STORAGE_KEY = 'inventory.database.v1';
const LOG_LIMIT = 2000;

/** 备份文件的数据结构版本：v2 起日志改为结构化 params 存储。 */
export const DATABASE_SCHEMA_VERSION = 2;

/** 导入高版本备份时的统一提示，界面与数据层共用同一句文案。 */
export const NEWER_BACKUP_MESSAGE = '该备份来自更高版本的应用，请升级 Inven Go 后再导入';

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyDatabase(): InventoryDatabase {
  return { version: DATABASE_SCHEMA_VERSION, products: [], logs: [] };
}

/** 新日志只保存结构化参数，展示文案由 {@link formatLogDetail} 统一生成。 */
export function makeLog(type: LogType, params: LogParams, undo?: UndoInfo): LogEntry {
  return {
    id: createId(),
    type,
    timestamp: Date.now(),
    params,
    ...(undo ? { undo } : {}),
  };
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isLogType(value: unknown): value is LogType {
  return (
    value === 'inbound' ||
    value === 'outbound' ||
    value === 'create' ||
    value === 'delete' ||
    value === 'import' ||
    value === 'export' ||
    value === 'barcode'
  );
}

function readProduct(value: unknown): Product | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  const barcodes = Array.isArray(record.barcodes)
    ? uniqueStrings(
        record.barcodes
          .filter((code): code is string => typeof code === 'string')
          .map((code) => cleanBarcode(code))
          .filter((code) => code.length > 0),
      )
    : [];
  const stock =
    typeof record.stock === 'number' && Number.isFinite(record.stock) ? Math.max(0, Math.floor(record.stock)) : 0;
  const now = Date.now();
  const product: Product = {
    id: record.id,
    name: record.name.trim() || '未命名商品',
    stock,
    barcodes,
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : now,
  };
  // 置顶信息只在确实置顶时才写回，避免给旧备份补齐无意义的字段。
  if (record.isPinned === true) {
    product.isPinned = true;
    if (typeof record.pinOrder === 'number' && Number.isFinite(record.pinOrder)) {
      product.pinOrder = Math.floor(record.pinOrder);
    }
  }
  return product;
}

/** 只接受纯对象形式的参数，数组 / null / 基本类型都视为无效。 */
function readLogParams(value: unknown): LogParams | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return { ...(value as LogParams) };
}

function readLog(value: unknown): LogEntry | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !isLogType(record.type)) return null;
  const params = readLogParams(record.params);
  const detail = typeof record.detail === 'string' ? record.detail : undefined;
  // v2 的参数日志与 v1 的纯文本日志都合法，两者皆无才视为脏数据。
  if (!params && detail === undefined) return null;
  const entry: LogEntry = {
    id: record.id,
    type: record.type,
    timestamp: typeof record.timestamp === 'number' ? record.timestamp : Date.now(),
  };
  if (params) entry.params = params;
  if (detail !== undefined) entry.detail = detail;
  return entry;
}

export type DatabaseParseResult =
  | { ok: true; database: InventoryDatabase }
  | { ok: false; reason: 'invalid' | 'newer-version' };

/**
 * 解析备份 / 本地存储：同时兼容 v1（纯文本日志）与 v2（结构化参数日志），
 * 并拦截高于当前版本的数据，避免降级使用旧应用时把新字段悄悄丢掉。
 */
export function inspectDatabase(raw: string): DatabaseParseResult {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object') return { ok: false, reason: 'invalid' };
    const record = data as Record<string, unknown>;
    const version = typeof record.version === 'number' ? record.version : 1;
    if (version > DATABASE_SCHEMA_VERSION) return { ok: false, reason: 'newer-version' };
    if (!Array.isArray(record.products) || !Array.isArray(record.logs)) return { ok: false, reason: 'invalid' };
    const parsed: InventoryDatabase = {
      version: DATABASE_SCHEMA_VERSION,
      products: record.products.map(readProduct).filter((product): product is Product => product !== null),
      logs: record.logs.map(readLog).filter((entry): entry is LogEntry => entry !== null),
    };
    // 旧版备份没有这个字段，只在明确传入布尔值时才保留，避免污染老文件语义。
    if (typeof record.includeLogs === 'boolean') parsed.includeLogs = record.includeLogs;
    return { ok: true, database: parsed };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

export function parseDatabase(raw: string): InventoryDatabase | null {
  const result = inspectDatabase(raw);
  return result.ok ? result.database : null;
}

export function trimLogs(logs: LogEntry[]): LogEntry[] {
  const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  return sorted.length > LOG_LIMIT ? sorted.slice(sorted.length - LOG_LIMIT) : sorted;
}

export function findProductByBarcode(products: Product[], barcode: string): Product | undefined {
  const normalized = cleanBarcode(barcode);
  return products.find((product) => product.barcodes.includes(normalized));
}

export function mergeDatabases(local: InventoryDatabase, incoming: InventoryDatabase): InventoryDatabase {
  const products = local.products.map((product) => ({ ...product, barcodes: [...product.barcodes] }));
  const byId = new Map(products.map((product) => [product.id, product]));
  const barcodeOwner = new Map<string, string>();
  for (const product of products) {
    for (const code of product.barcodes) barcodeOwner.set(code, product.id);
  }

  for (const source of incoming.products) {
    const current = byId.get(source.id);
    if (current) {
      current.name = source.name.trim() || current.name;
      current.stock = source.stock;
      current.updatedAt = Date.now();
      for (const code of source.barcodes) {
        if (!barcodeOwner.has(code)) {
          current.barcodes.push(code);
          barcodeOwner.set(code, current.id);
        }
      }
      continue;
    }

    const barcodes = source.barcodes.filter((code) => !barcodeOwner.has(code));
    if (barcodes.length === 0) continue;
    const created: Product = {
      ...source,
      name: source.name.trim() || '未命名商品',
      barcodes,
      updatedAt: Date.now(),
    };
    products.push(created);
    byId.set(created.id, created);
    for (const code of barcodes) barcodeOwner.set(code, created.id);
  }

  const seen = new Set(local.logs.map((log) => log.id));
  const logs = [...local.logs];
  for (const log of incoming.logs) {
    if (seen.has(log.id)) continue;
    logs.push(log);
    seen.add(log.id);
  }

  return { version: DATABASE_SCHEMA_VERSION, products, logs };
}
