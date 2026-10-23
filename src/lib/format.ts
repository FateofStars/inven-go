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

/**
 * 把数量输入框的文本解析成整数，0 属于合法结果（用户删空后的临时态）。
 * 空内容或含非数字字符时返回 null，由调用方决定「回填 0」还是忽略。
 */
export function parseQuantityInput(text: string): number | null {
  const normalized = text.trim().replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isSafeInteger(value)) return null;
  return value;
}
