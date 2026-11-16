// 作品 清单.ts 尾部的通用部分（段目录、段名、编号），各作品都用这一份。纯模块。
// 用法：export const { segDir, segmentName, segmentCode } = manifestTools(manifest);  pipeline（清单/清单.ts、源码/内容.ts）照这三个导出读作品。
import type { ManifestEntry } from './清单条目.ts';

export const manifestTools = (manifest: readonly ManifestEntry[]) => {
  /** 段目录（相对作品根）：核对段在 核对/<名>，其余在 段/<段键> */
  const segDir = (segKey: string) => (segKey.startsWith('核对-') ? `核对/${segKey.slice('核对-'.length)}` : `段/${segKey}`);
  /** 段名 = 段键去掉「<章>-」 */
  const segmentName = (entry: ManifestEntry) => entry.键.slice(String(entry.章).length + 1);
  /** 编号：章内按清单顺序的两位序号；核对段没有 */
  const segmentCode = (segKey: string): string | null => {
    const entry = manifest.find((t) => t.键 === segKey);
    if (!entry || entry.章 === '核对') return null;
    const chapterIndex = manifest.filter((t) => t.章 === entry.章).findIndex((t) => t.键 === segKey) + 1;
    return `${entry.章}-${String(chapterIndex).padStart(2, '0')}`;
  };
  return { segDir, segmentName, segmentCode };
};
