/**
 * 条码的「视觉分段」工具。
 *
 * 分段只服务于展示与人工核对：数据库、日志与任何逻辑比对都必须先经过
 * `cleanBarcode`，保证底层永远只保存无空格的原始字符串。
 */

/** 非标准长度的条码 / 序列号统一按 4 位一组展示。 */
const GROUP_SIZE = 4;

/** 日志等长文本里，只有达到这个位数的数字才当作条码分组，避免误伤库存数量。 */
const MIN_INLINE_DIGITS = 6;
const INLINE_BARCODE_PATTERN = new RegExp(`\\d{${MIN_INLINE_DIGITS},}`, 'g');

/** 去掉全部分段空格，得到可入库、可比对的原始条码。 */
export function cleanBarcode(formatted: string): string {
  return formatted.replace(/\s+/g, '');
}

function groupDigits(digits: string): string {
  const groups: string[] = [];
  for (let index = 0; index < digits.length; index += GROUP_SIZE) {
    groups.push(digits.slice(index, index + GROUP_SIZE));
  }
  return groups.join(' ');
}

/**
 * 按实体包装的印刷分法给条码加空格：
 * - 13 位（EAN-13）：`1 - 6 - 6`
 * - 8 位（EAN-8）：`4 - 4`
 * - 12 位（UPC-A）：`1 - 5 - 5 - 1`
 * - 其余纯数字：4 位一组
 * - 含字母的条码 / 序列号：只把其中的数字段按 4 位分组，其余字符原样保留
 */
export function formatBarcode(raw: string): string {
  const clean = cleanBarcode(raw);
  if (!clean) return '';
  if (!/^\d+$/.test(clean)) {
    return clean.replace(/\d+/g, (digits) => groupDigits(digits));
  }
  if (clean.length === 13) {
    return `${clean.slice(0, 1)} ${clean.slice(1, 7)} ${clean.slice(7)}`;
  }
  if (clean.length === 8) {
    return `${clean.slice(0, 4)} ${clean.slice(4)}`;
  }
  if (clean.length === 12) {
    return `${clean.slice(0, 1)} ${clean.slice(1, 6)} ${clean.slice(6, 11)} ${clean.slice(11)}`;
  }
  return groupDigits(clean);
}

/**
 * 日志详情里的条码：日志是一整句文本，无法单独给条码套样式，
 * 这里只对足够长的数字串做分段，其余文字与排版保持原样。
 */
export function formatBarcodeInText(text: string): string {
  return text.replace(INLINE_BARCODE_PATTERN, (digits) => formatBarcode(digits));
}

/**
 * 条码输入框的逐键编辑：返回只含原始字符的干净条码。
 * 退格正好打到分段空格时，连带删掉空格前的字符，避免出现「按了没反应」。
 */
export function editBarcode(previousRaw: string, nextText: string): string {
  const previous = formatBarcode(previousRaw);
  if (previous.length - nextText.length === 1) {
    let index = 0;
    while (index < nextText.length && previous[index] === nextText[index]) index += 1;
    if (previous[index] === ' ') {
      return cleanBarcode(previous.slice(0, index - 1) + previous.slice(index + 1));
    }
  }
  return cleanBarcode(nextText);
}
