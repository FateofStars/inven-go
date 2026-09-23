/**
 * Metro 会把图片等静态资源解析成资源标识，但 React Native 与 expo/types 都没有
 * 提供 `*.png` 的模块声明。这里补上，让源码可以安全地静态 import 图片。
 */

declare module '*.png' {
  const source: number;
  export default source;
}
