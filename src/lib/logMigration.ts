import type { LogEntry, LogParams, LogType } from '@/lib/types';

/**
 * 历史日志反向清洗引擎。
 *
 * 旧版日志把完整中文文案固化在 `detail` 里，新版只存结构化 `params`。
 * 这里按日志类型用正则把核心字段提取出来，缺失字段的极特殊文案则兜底保存为
 * `{ legacyDetail }`，保证任何一条历史记录都不会丢失。
 */

/** 手动 / 扫码入库（带件数）：`手动入库「铅笔」5 件，库存 3 → 8`。 */
const STOCK_IN_PATTERN = /^(手动|扫码)?入库「(.*?)」(\d+)\s*件.*?库存\s*(\d+)\s*→\s*(\d+)/;
/** 手动 / 扫码出库（带件数）。 */
const STOCK_OUT_PATTERN = /^(手动|扫码)?出库「(.*?)」(\d+)\s*件.*?库存\s*(\d+)\s*→\s*(\d+)/;
/** 扫码入库（无件数、带条码）：`入库「铅笔」，条码 690123，库存 3 → 4`。 */
const SCAN_IN_PATTERN = /^入库「(.*?)」，条码\s*(.*?)，库存\s*(\d+)\s*→\s*(\d+)/;
/** 扫码出库（无件数、带条码）。 */
const SCAN_OUT_PATTERN = /^出库「(.*?)」，条码\s*(.*?)，库存\s*(\d+)\s*→\s*(\d+)/;
/** 绑定新条码并入库：`商品「铅笔」绑定条码 690123 并入库 5 件，库存 3 → 8`。 */
const BIND_PATTERN = /^商品「(.*?)」绑定条码\s*(.*?)\s*并入库\s*(\d+)\s*件，库存\s*(\d+)\s*→\s*(\d+)/;
/** 新增商品：`新增商品「铅笔」，条码 690123，初始库存 5`。 */
const CREATE_PATTERN = /新增商品「(.*?)」，条码\s*(.*?)，初始库存\s*(\d+)/;
/** 导出：`导出数据库，商品 3 个，日志 12 条` / `导出数据库（不含日志），商品 3 个`。 */
const EXPORT_PATTERN = /导出数据库(?:（不含日志）)?，商品\s*(\d+)\s*个(?:，日志\s*(\d+)\s*条)?/;
/** 删除商品：`删除商品「铅笔」，条码 690123，删除前库存 5`。 */
const DELETE_PATTERN = /删除商品「(.*?)」，条码\s*(.*?)，删除前库存\s*(\d+)/;
/** 条码新增 / 修改 / 删除。 */
const BARCODE_ADD_PATTERN = /更新商品绑定条码：「(.*?)」新增条码\s*(.*)/;
const BARCODE_REPLACE_PATTERN = /更新商品绑定条码：「(.*?)」将\s*(.*?)\s*修改为\s*(.*)/;
const BARCODE_REMOVE_PATTERN = /更新商品绑定条码：「(.*?)」删除条码\s*(.*)/;
/** 导入：覆盖 / 合并两种文案。 */
const IMPORT_REPLACE_PATTERN = /覆盖导入数据库，商品\s*(\d+)\s*个，历史日志\s*(\d+)\s*条/;
const IMPORT_MERGE_PATTERN = /合并导入数据库，商品\s*(\d+)\s*个，日志\s*(\d+)\s*条/;

function toNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 从「条码 xxx，」里再抽一次条码，用于带件数但可能附带条码的入库文案。 */
function pickBarcode(detail: string): string | undefined {
  const matched = /条码\s*(.*?)，/.exec(detail);
  return matched ? matched[1] : undefined;
}

function extractStockMove(type: 'inbound' | 'outbound', detail: string): LogParams | null {
  if (type === 'inbound') {
    const bound = BIND_PATTERN.exec(detail);
    if (bound) {
      return {
        mode: 'bind',
        name: bound[1],
        barcode: bound[2],
        amount: toNumber(bound[3]),
        stock: toNumber(bound[4]),
        nextStock: toNumber(bound[5]),
      };
    }
  }

  const moved = (type === 'inbound' ? STOCK_IN_PATTERN : STOCK_OUT_PATTERN).exec(detail);
  if (moved) {
    const mode = moved[1] === '手动' ? 'manual' : 'scan';
    const params: LogParams = {
      mode,
      name: moved[2],
      amount: toNumber(moved[3]),
      stock: toNumber(moved[4]),
      nextStock: toNumber(moved[5]),
    };
    if (mode === 'scan') {
      const barcode = pickBarcode(detail);
      if (barcode) params.barcode = barcode;
    }
    return params;
  }

  const scanned = (type === 'inbound' ? SCAN_IN_PATTERN : SCAN_OUT_PATTERN).exec(detail);
  if (scanned) {
    const stock = toNumber(scanned[3]);
    const nextStock = toNumber(scanned[4]);
    return {
      mode: 'scan',
      name: scanned[1],
      barcode: scanned[2],
      amount: Math.abs(nextStock - stock),
      stock,
      nextStock,
    };
  }
  return null;
}

function extractParams(type: LogType, detail: string): LogParams | null {
  switch (type) {
    case 'inbound':
    case 'outbound':
      return extractStockMove(type, detail);
    case 'create': {
      const matched = CREATE_PATTERN.exec(detail);
      return matched
        ? { name: matched[1], barcode: matched[2], stock: toNumber(matched[3]) }
        : null;
    }
    case 'delete': {
      const matched = DELETE_PATTERN.exec(detail);
      return matched
        ? { name: matched[1], barcodes: matched[2], stock: toNumber(matched[3]) }
        : null;
    }
    case 'barcode': {
      const added = BARCODE_ADD_PATTERN.exec(detail);
      if (added) return { action: 'add', name: added[1], barcode: added[2] };
      const replaced = BARCODE_REPLACE_PATTERN.exec(detail);
      if (replaced) return { action: 'replace', name: replaced[1], from: replaced[2], to: replaced[3] };
      const removed = BARCODE_REMOVE_PATTERN.exec(detail);
      if (removed) return { action: 'remove', name: removed[1], barcode: removed[2] };
      return null;
    }
    case 'export': {
      const matched = EXPORT_PATTERN.exec(detail);
      if (!matched) return null;
      return {
        productCount: toNumber(matched[1]),
        logCount: toNumber(matched[2]),
        includeLogs: matched[2] !== undefined,
      };
    }
    case 'import': {
      const replaced = IMPORT_REPLACE_PATTERN.exec(detail);
      if (replaced) {
        return {
          mode: 'replace',
          productCount: toNumber(replaced[1]),
          logCount: toNumber(replaced[2]),
        };
      }
      const merged = IMPORT_MERGE_PATTERN.exec(detail);
      if (merged) {
        return {
          mode: 'merge',
          productCount: toNumber(merged[1]),
          logCount: toNumber(merged[2]),
        };
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * 把一批历史日志清洗为参数化结构：
 * - 已有 `params` 的新日志原样保留；
 * - 只有 `detail` 的旧日志按类型反向提取参数，并移除 `detail`；
 * - 无法识别的特殊文案兜底为 `{ legacyDetail }`，展示与数据都不丢。
 */
export function migrateLegacyLogs(logs: LogEntry[]): LogEntry[] {
  return logs.map((log) => {
    if (log.params) return log;
    const detail = log.detail ?? '';
    const params = extractParams(log.type, detail) ?? { legacyDetail: detail };
    const migrated: LogEntry = {
      id: log.id,
      type: log.type,
      timestamp: log.timestamp,
      params,
    };
    if (log.undo) migrated.undo = log.undo;
    return migrated;
  });
}
