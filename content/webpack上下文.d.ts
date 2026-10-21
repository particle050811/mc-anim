// webpack 的目录批量导入（注册.tsx 用 import.meta.webpackContext 按清单取各段模块）
interface ImportMeta {
  webpackContext(dir: string, options: { recursive?: boolean; regExp: RegExp }): { keys(): string[]; (key: string): unknown };
}
