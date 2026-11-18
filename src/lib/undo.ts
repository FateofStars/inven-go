import type { LogEntry } from '@/lib/types';

/** 操作完成后 3 分钟内可撤销，超时后撤销入口自动消失。 */
export const UNDO_WINDOW_MS = 3 * 60 * 1000;

/** 该条日志当前剩余的可撤销时长；不可撤销或已过期时为 0。 */
export function undoRemaining(entry: LogEntry, now: number): number {
  if (!entry.undo) return 0;
  return Math.max(0, entry.timestamp + UNDO_WINDOW_MS - now);
}

/** 倒计时展示为 mm:ss，向上取整避免最后一秒提前消失。 */
export function formatUndoCountdown(remaining: number): string {
  const total = Math.max(0, Math.ceil(remaining / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
