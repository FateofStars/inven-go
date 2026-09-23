import { Directory, File, Paths } from 'expo-file-system';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';

import { parseDatabase } from '@/lib/database';
import type { InventoryDatabase } from '@/lib/types';

/** 快照保存在 App 私有文档目录下，不会被系统清理缓存时删掉。 */
const SNAPSHOT_FOLDER = 'backups';
const SNAPSHOT_LIMIT = 5;
const SNAPSHOT_PATTERN = /^backup_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})\.json$/;

let snapshotDirectory: Directory | null = null;

/** 惰性获取，避免在模块加载阶段就去访问原生文件系统模块。 */
function getSnapshotDirectory(): Directory {
  if (!snapshotDirectory) {
    snapshotDirectory = new Directory(Paths.document, SNAPSHOT_FOLDER);
  }
  return snapshotDirectory;
}

export type Snapshot = {
  name: string;
  uri: string;
  createdAt: number;
  productCount: number;
  logCount: number;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 形如 backup_2026-09-21_2330.json */
function snapshotFileName(date: Date): string {
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `backup_${ymd}_${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

/** 从文件名反解出创建时间，避免依赖文件元数据接口。 */
function parseSnapshotTime(name: string): number | null {
  const matched = SNAPSHOT_PATTERN.exec(name);
  if (!matched) return null;
  const [, year, month, day, hour, minute] = matched;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
}

function listSnapshotEntries(): { file: File; name: string; createdAt: number }[] {
  const directory = getSnapshotDirectory();
  if (!directory.exists) return [];
  const entries: { file: File; name: string; createdAt: number }[] = [];
  for (const entry of directory.list()) {
    if (!(entry instanceof File)) continue;
    const createdAt = parseSnapshotTime(entry.name);
    if (createdAt === null) continue;
    entries.push({ file: entry, name: entry.name, createdAt });
  }
  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 在 App 私有目录里静默保存一份快照，并只保留最近 {@link SNAPSHOT_LIMIT} 份。
 * 返回本次写入的快照信息；写入失败会抛出，由调用方决定是否忽略。
 */
export function saveSnapshot(database: InventoryDatabase): Snapshot {
  const directory = getSnapshotDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  const now = new Date();
  const name = snapshotFileName(now);
  const file = new File(directory, name);
  file.write(JSON.stringify(database, null, 2));

  const entries = listSnapshotEntries();
  for (const entry of entries.slice(SNAPSHOT_LIMIT)) {
    try {
      entry.file.delete();
    } catch {
      // 旧快照清理失败不影响本次导出
    }
  }

  return {
    name,
    uri: file.uri,
    createdAt: parseSnapshotTime(name) ?? Date.now(),
    productCount: database.products.length,
    logCount: database.logs.length,
  };
}

/** 列出本机快照（按时间倒序），顺带读出商品数与日志数用于展示。 */
export async function listSnapshots(): Promise<Snapshot[]> {
  const snapshots: Snapshot[] = [];
  for (const entry of listSnapshotEntries()) {
    try {
      const parsed = parseDatabase(await entry.file.text());
      if (!parsed) continue;
      snapshots.push({
        name: entry.name,
        uri: entry.file.uri,
        createdAt: entry.createdAt,
        productCount: parsed.products.length,
        logCount: parsed.logs.length,
      });
    } catch {
      // 快照损坏时跳过，不影响其他记录
    }
  }
  return snapshots;
}

export function readSnapshotText(uri: string): Promise<string> {
  return new File(uri).text();
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byteIndex = 0;
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < clean.length; index += 1) {
    const value = BASE64_ALPHABET.indexOf(clean[index]);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byteIndex] = (buffer >> bits) & 0xff;
      byteIndex += 1;
    }
  }
  return bytes.subarray(0, byteIndex);
}

/** 把 base64 还原成 UTF-8 字符串（不依赖 atob / TextDecoder，Hermes 上同样可用）。 */
function decodeBase64Utf8(base64: string): string {
  const bytes = base64ToBytes(base64);
  const chunks: string[] = [];
  let index = 0;
  while (index < bytes.length) {
    const first = bytes[index];
    index += 1;
    if (first < 0x80) {
      chunks.push(String.fromCharCode(first));
      continue;
    }
    if (first < 0xe0) {
      const second = bytes[index];
      index += 1;
      chunks.push(String.fromCharCode(((first & 0x1f) << 6) | (second & 0x3f)));
      continue;
    }
    if (first < 0xf0) {
      const second = bytes[index];
      const third = bytes[index + 1];
      index += 2;
      chunks.push(String.fromCharCode(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f)));
      continue;
    }
    const second = bytes[index];
    const third = bytes[index + 1];
    const fourth = bytes[index + 2];
    index += 3;
    const codePoint = ((first & 0x07) << 18) | ((second & 0x3f) << 12) | ((third & 0x3f) << 6) | (fourth & 0x3f);
    const offset = codePoint - 0x10000;
    chunks.push(String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff)));
  }
  return chunks.join('');
}

/**
 * 读取用户选中的备份文件，三层降级：
 * 1. expo-file-system 新 API（DocumentPicker 已把文件复制进私有缓存时走这里）；
 * 2. legacy UTF-8 读取（另一套原生实现，走 contentResolver / DocumentFile）；
 * 3. legacy base64 读取后自行解码 —— 不经过字符串编码转换，
 *    在厂商 ROM 对 content:// 限制严格时穿透率最高。
 */
export async function readPickedText(uri: string): Promise<string> {
  try {
    return await new File(uri).text();
  } catch {
    // 降级到下一层
  }
  try {
    return await readAsStringAsync(uri, { encoding: EncodingType.UTF8 });
  } catch {
    // 降级到下一层
  }
  return decodeBase64Utf8(await readAsStringAsync(uri, { encoding: EncodingType.Base64 }));
}
