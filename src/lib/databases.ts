import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEY, emptyDatabase, parseDatabase } from '@/lib/database';
import type { InventoryDatabase } from '@/lib/types';

/** 单个数据库的元信息。 */
export type DatabaseEntry = {
  id: string;
  name: string;
  createdAt: number;
};

/** 数据库注册表：记录本机全部数据库以及当前激活的那一个。 */
export type DatabaseRegistry = {
  version: 1;
  activeId: string;
  items: DatabaseEntry[];
};

/**
 * 管理页展示用的汇总信息。
 * 商品数、日志数与最后更新时间都从各库的数据里现算，而不是额外存一份计数 ——
 * 否则每次改库存都要多写一次注册表，既慢又容易和真实数据不一致。
 */
export type DatabaseSummary = DatabaseEntry & {
  productCount: number;
  logCount: number;
  updatedAt: number;
};

/** 升级前的单库数据存在这个 Key 下，迁移后仍由「默认数据库」沿用，老数据原地可用。 */
export const DEFAULT_DATABASE_ID = 'default';
export const DEFAULT_DATABASE_NAME = '默认数据库';

const REGISTRY_KEY = 'inventory.databases.v1';
const DATA_PREFIX = 'inventory.database.';

/** 每座数据库的商品与日志都存在各自的 Key 下，彼此物理隔离。 */
export function dataKey(id: string): string {
  return id === DEFAULT_DATABASE_ID ? STORAGE_KEY : `${DATA_PREFIX}${id}`;
}

/** 名称允许的字符：中文、英文字母、数字以及 . - _ */
const NAME_PATTERN = /^[a-zA-Z0-9\u4e00-\u9fa5.\-_]+$/;

export type NameCheck =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' | 'invalid' | 'duplicate'; message: string };

/**
 * 校验数据库名称：非空、字符合法、且与其他数据库不重名（英文字母不区分大小写）。
 * 传 selfId 时允许与自身同名，用于「修改名称」回填原名的场景。
 */
export function validateDatabaseName(raw: string, others: DatabaseEntry[], selfId?: string): NameCheck {
  const name = raw.trim();
  if (!name) return { ok: false, reason: 'empty', message: '请输入数据库名称' };
  if (!NAME_PATTERN.test(name)) return { ok: false, reason: 'invalid', message: '含有非法字符' };
  const lower = name.toLowerCase();
  if (others.some((item) => item.id !== selfId && item.name.toLowerCase() === lower)) {
    return { ok: false, reason: 'duplicate', message: '该名称已被其他数据库占用' };
  }
  return { ok: true, name };
}

function readEntry(value: unknown): DatabaseEntry | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id) return null;
  if (typeof record.name !== 'string' || !record.name.trim()) return null;
  return {
    id: record.id,
    name: record.name.trim(),
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
  };
}

function parseRegistry(raw: string | null): DatabaseRegistry | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object') return null;
    const record = data as Record<string, unknown>;
    if (!Array.isArray(record.items)) return null;
    const items = record.items.map(readEntry).filter((entry): entry is DatabaseEntry => entry !== null);
    if (items.length === 0) return null;
    const activeId =
      typeof record.activeId === 'string' && items.some((item) => item.id === record.activeId)
        ? record.activeId
        : items[0].id;
    return { version: 1, activeId, items };
  } catch {
    return null;
  }
}

/** 读取某个数据库的数据；缺失或损坏时退化为空库，绝不抛错。 */
export async function readDatabaseData(id: string): Promise<InventoryDatabase> {
  const raw = await AsyncStorage.getItem(dataKey(id));
  return (raw ? parseDatabase(raw) : null) ?? emptyDatabase();
}

/** 最后更新时间取「创建时间」与「最后一条商品/日志时间」中的最大值。 */
export function latestActivity(data: InventoryDatabase, fallback: number): number {
  let latest = fallback;
  for (const product of data.products) {
    latest = Math.max(latest, product.createdAt, product.updatedAt);
  }
  for (const log of data.logs) {
    latest = Math.max(latest, log.timestamp);
  }
  return latest;
}

export function summarize(entry: DatabaseEntry, data: InventoryDatabase): DatabaseSummary {
  return {
    ...entry,
    productCount: data.products.length,
    logCount: data.logs.length,
    updatedAt: latestActivity(data, entry.createdAt),
  };
}

/** 逐个读取各库数据，汇总成管理页要展示的列表。 */
export async function listSummaries(registry: DatabaseRegistry): Promise<DatabaseSummary[]> {
  const summaries: DatabaseSummary[] = [];
  for (const entry of registry.items) {
    try {
      summaries.push(summarize(entry, await readDatabaseData(entry.id)));
    } catch {
      // 单个库读取失败不应拖垮整张列表，退化成只展示元信息。
      summaries.push({ ...entry, productCount: 0, logCount: 0, updatedAt: entry.createdAt });
    }
  }
  return summaries;
}

export function persistRegistry(registry: DatabaseRegistry): Promise<void> {
  return AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
}

/**
 * 读取数据库注册表；首次升级时把旧版单库数据封装成【默认数据库】。
 * 默认库直接沿用旧版 Key（见 {@link dataKey}），老数据原地保留，零拷贝、零丢失风险。
 */
export async function loadRegistry(): Promise<DatabaseRegistry> {
  const existing = parseRegistry(await AsyncStorage.getItem(REGISTRY_KEY));
  if (existing) return existing;

  const entry: DatabaseEntry = {
    id: DEFAULT_DATABASE_ID,
    name: DEFAULT_DATABASE_NAME,
    createdAt: Date.now(),
  };
  const registry: DatabaseRegistry = { version: 1, activeId: entry.id, items: [entry] };
  // 旧版从未存过数据时补一个空库，保证默认库的数据 Key 始终存在。
  if (!(await AsyncStorage.getItem(STORAGE_KEY))) {
    await AsyncStorage.setItem(dataKey(entry.id), JSON.stringify(emptyDatabase()));
  }
  await persistRegistry(registry);
  return registry;
}

export function removeDatabaseData(id: string): Promise<void> {
  return AsyncStorage.removeItem(dataKey(id));
}
