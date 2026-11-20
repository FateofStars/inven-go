export type LogType = 'inbound' | 'outbound' | 'create' | 'delete' | 'import' | 'export' | 'barcode';

export type Product = {
  id: string;
  name: string;
  stock: number;
  barcodes: string[];
  createdAt: number;
  updatedAt: number;
  /** 是否置顶：置顶商品在首页强制排在最前方的置顶区域。 */
  isPinned?: boolean;
  /** 置顶商品内的自定义排序索引，越小越靠前；未置顶商品不带此字段。 */
  pinOrder?: number;
};

/**
 * 可撤销操作的回滚信息，随日志一起落盘，仅在创建后的限时窗口内有效。
 * - `stock`：只回退库存增减，不覆盖期间发生的其他改动；
 * - `product`：用操作前的商品快照整体覆盖；`before` 为 null 表示操作新建了商品，撤销即删除。
 */
export type UndoInfo =
  | { kind: 'stock'; productId: string; delta: number }
  | { kind: 'product'; productId: string; before: Product | null };

/**
 * 日志参数：新版日志只保存结构化数据，展示时再由 {@link formatLogDetail} 套用中文模板，
 * 避免把冗长重复的文案逐条落盘。
 */
export type LogParams = Record<string, any>;

export type LogEntry = {
  id: string;
  type: LogType;
  timestamp: number;
  /** 新版：结构化参数字典（轻量存储）。 */
  params?: LogParams;
  /** 旧版兼容：历史纯文本描述（可选）。 */
  detail?: string;
  /** 可撤销操作的回滚信息；导入的备份日志不携带该字段。 */
  undo?: UndoInfo;
};

export type InventoryDatabase = {
  version: 2;
  products: Product[];
  logs: LogEntry[];
  /**
   * 导出包的日志开关标记，仅在「导出数据库」关闭「包含日志」时写入 `false`。
   * 旧版本备份文件没有这个字段，缺失一律视为包含完整日志，保证双向兼容。
   */
  includeLogs?: boolean;
};

export type ImportMode = 'merge' | 'replace';

export const logTypeLabel: Record<LogType, string> = {
  inbound: '入库',
  outbound: '出库',
  create: '新增商品',
  delete: '删除商品',
  import: '导入',
  export: '导出',
  barcode: '条码更新',
};

/** 参数取值：只认字符串与数字，缺失或类型异常时返回空串，避免拼出 undefined。 */
function readParam(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/**
 * 统一的日志详情渲染，所有展示日志的界面都必须走这里：
 * - 新版日志只有 `params`：按 `type` 套用中文模板动态拼接；
 * - 旧版日志没有 `params`：无缝降级为原本的 `detail` 纯文本。
 */
export function formatLogDetail(log: LogEntry): string {
  const fallback = log.detail ?? '';
  const params = log.params;
  if (!params) return fallback;
  // 迁移兜底：无法反向提炼的旧文案原样存在 legacyDetail 里，直接展示。
  if (typeof params.legacyDetail === 'string') return params.legacyDetail;
  const name = readParam(params.name);
  const barcode = readParam(params.barcode);
  const stock = readParam(params.stock);
  const nextStock = readParam(params.nextStock);
  switch (log.type) {
    case 'create':
      if (!name) return fallback;
      return `新增商品「${name}」，条码 ${barcode}，初始库存 ${stock}`;
    case 'delete':
      if (!name) return fallback;
      return `删除商品「${name}」，条码 ${readParam(params.barcodes) || '无'}，删除前库存 ${stock}`;
    case 'inbound':
      if (!name) return fallback;
      if (params.mode === 'manual') {
        return `手动入库「${name}」${readParam(params.amount)} 件，库存 ${stock} → ${nextStock}`;
      }
      if (params.mode === 'bind') {
        return `商品「${name}」绑定条码 ${barcode} 并入库 ${readParam(params.amount)} 件，库存 ${stock} → ${nextStock}`;
      }
      if (params.mode === 'scan' && !barcode) {
        return `扫码入库 +${readParam(params.amount)}，当前库存 ${nextStock}`;
      }
      return `入库「${name}」，条码 ${barcode}，库存 ${stock} → ${nextStock}`;
    case 'outbound':
      if (!name) return fallback;
      if (params.mode === 'manual') {
        return `手动出库「${name}」${readParam(params.amount)} 件，库存 ${stock} → ${nextStock}`;
      }
      if (params.mode === 'scan' && !barcode) {
        return `扫码出库 -${readParam(params.amount)}，当前库存 ${nextStock}`;
      }
      return `出库「${name}」，条码 ${barcode}，库存 ${stock} → ${nextStock}`;
    case 'barcode':
      if (!name) return fallback;
      if (params.action === 'add') return `更新商品绑定条码：「${name}」新增条码 ${barcode}`;
      if (params.action === 'replace') {
        return `更新商品绑定条码：「${name}」将 ${readParam(params.from)} 修改为 ${readParam(params.to)}`;
      }
      if (params.action === 'remove') return `更新商品绑定条码：「${name}」删除条码 ${barcode}`;
      return fallback;
    case 'export':
      if (params.includeLogs === false) {
        return `导出数据库（不含日志），商品 ${readParam(params.productCount)} 个`;
      }
      return `导出数据库，商品 ${readParam(params.productCount)} 个，日志 ${readParam(params.logCount)} 条`;
    case 'import':
      if (params.mode === 'replace') {
        return `覆盖导入数据库，商品 ${readParam(params.productCount)} 个，历史日志 ${readParam(params.logCount)} 条`;
      }
      return `合并导入数据库，商品 ${readParam(params.productCount)} 个，日志 ${readParam(params.logCount)} 条`;
    default:
      return fallback;
  }
}
