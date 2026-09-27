export type LogType = 'inbound' | 'outbound' | 'create' | 'delete' | 'import' | 'export' | 'barcode';

export type Product = {
  id: string;
  name: string;
  stock: number;
  barcodes: string[];
  createdAt: number;
  updatedAt: number;
};

export type LogEntry = {
  id: string;
  type: LogType;
  detail: string;
  timestamp: number;
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
