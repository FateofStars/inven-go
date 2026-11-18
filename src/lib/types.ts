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

export type LogEntry = {
  id: string;
  type: LogType;
  detail: string;
  timestamp: number;
  /** 可撤销操作的回滚信息；导入的备份日志不携带该字段。 */
  undo?: UndoInfo;
};

export type InventoryDatabase = {
  version: 1;
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
