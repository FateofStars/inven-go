export type LogType = 'inbound' | 'outbound' | 'create' | 'delete' | 'import' | 'export';

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
};

export type ImportMode = 'merge' | 'replace';

export const logTypeLabel: Record<LogType, string> = {
  inbound: '入库',
  outbound: '出库',
  create: '新增商品',
  delete: '删除商品',
  import: '导入',
  export: '导出',
};
