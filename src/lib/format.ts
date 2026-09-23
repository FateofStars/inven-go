export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function shortenBarcode(code: string): string {
  if (code.length <= 18) return code;
  return `${code.slice(0, 8)}…${code.slice(-4)}`;
}

export function barcodeSummary(barcodes: string[]): string {
  if (barcodes.length === 0) return '未绑定条码';
  const head = shortenBarcode(barcodes[0]);
  if (barcodes.length === 1) return head;
  return `${head} 等 ${barcodes.length} 个`;
}

export function parsePositiveInteger(text: string): number | null {
  const normalized = text.trim().replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}
