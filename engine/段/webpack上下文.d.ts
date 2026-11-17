// webpack 的目录批量导入（注册.tsx 用 import.meta.webpackContext 按清单取各段模块）；mode: 'lazy' 的取模块返回 Promise
interface ImportMeta {
  webpackContext(dir: string, options: { recursive?: boolean; regExp: RegExp; mode: 'lazy' }): { keys(): string[]; (key: string): Promise<unknown> };
  webpackContext(dir: string, options: { recursive?: boolean; regExp: RegExp }): { keys(): string[]; (key: string): unknown };
}
