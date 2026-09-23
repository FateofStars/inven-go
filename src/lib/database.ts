import type { InventoryDatabase, LogEntry, LogType, Product } from '@/lib/types';

export const STORAGE_KEY = 'inventory.database.v1';
const LOG_LIMIT = 2000;

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyDatabase(): InventoryDatabase {
  return { version: 1, products: [], logs: [] };
}

export function makeLog(type: LogType, detail: string): LogEntry {
  return {
    id: createId(),
    type,
    detail,
    timestamp: Date.now(),
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
    value === 'export'
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
          .map((code) => code.trim())
          .filter((code) => code.length > 0),
      )
    : [];
  const stock =
    typeof record.stock === 'number' && Number.isFinite(record.stock) ? Math.max(0, Math.floor(record.stock)) : 0;
  const now = Date.now();
  return {
    id: record.id,
    name: record.name.trim() || '未命名商品',
    stock,
    barcodes,
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : now,
  };
}

function readLog(value: unknown): LogEntry | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.detail !== 'string' || !isLogType(record.type)) return null;
  return {
    id: record.id,
    type: record.type,
    detail: record.detail,
    timestamp: typeof record.timestamp === 'number' ? record.timestamp : Date.now(),
  };
}

export function parseDatabase(raw: string): InventoryDatabase | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object') return null;
    const record = data as Record<string, unknown>;
    if (!Array.isArray(record.products) || !Array.isArray(record.logs)) return null;
    return {
      version: 1,
      products: record.products.map(readProduct).filter((product): product is Product => product !== null),
      logs: record.logs.map(readLog).filter((entry): entry is LogEntry => entry !== null),
    };
  } catch {
    return null;
  }
}

export function trimLogs(logs: LogEntry[]): LogEntry[] {
  const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  return sorted.length > LOG_LIMIT ? sorted.slice(sorted.length - LOG_LIMIT) : sorted;
}

export function findProductByBarcode(products: Product[], barcode: string): Product | undefined {
  const normalized = barcode.trim();
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

  return { version: 1, products, logs };
}
