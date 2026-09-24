/**
 * 应用信息的唯一来源。
 *
 * 所有需要展示版本号的地方（设置页「关于」入口、关于页面等）都必须调用
 * `getAppVersion()`，不要各写各的字面量，未来发版只改这一处即可。
 */

const APP_VERSION = 'v1.1.2';

export function getAppVersion(): string {
  return APP_VERSION;
}
