// 检查用的内容视图：执行所查作品的 清单.ts 和各段 段.ts（纯模块），按清单顺序给出每段的定义；场键的先后按清单里第一次出现排。
import type { SegmentDef } from '../../engine/段/段定义.ts';
import type { CheckContext } from './上下文.ts';

export type ManifestLine = { 键: string; 章: number | '核对'; 集?: number };
export type SegItem = ManifestLine & { 目录: string; 段文件: string; definition?: SegmentDef; 错误?: string };
export type ParsedContent = { segments: SegItem[]; sceneOrder: string[] } | { 错误: string };

const contentCache = new WeakMap<CheckContext, Promise<ParsedContent>>();

export const readContent = (c: CheckContext): Promise<ParsedContent> => {
  let r = contentCache.get(c);
  if (!r) {
    r = (async (): Promise<ParsedContent> => {
      const manifestPath = c.workPath('清单.ts');
      if (!c.exists(manifestPath)) return { 错误: `没有 ${manifestPath}` };
      const m = await c.loadModule(manifestPath);
      if (!m.模块) return { 错误: `${manifestPath} 执行出错：${m.错误}` };
      const manifestRows = m.模块.清单 as ManifestLine[] | undefined;
      const segDir = m.模块.segDir as ((segKey: string) => string) | undefined;
      if (!Array.isArray(manifestRows) || typeof segDir !== 'function') return { 错误: `${manifestPath} 要导出 清单 数组和 段目录 函数` };
      const segments: SegItem[] = [];
      for (const t of manifestRows) {
        const absSegDir = c.workPath(segDir(t.键));
        const segFile = `${absSegDir}/段.ts`;
        const item: SegItem = { ...t, 目录: absSegDir, 段文件: segFile };
        if (!c.exists(segFile)) item.错误 = `缺 ${segFile}`;
        else {
          const d = await c.loadModule(segFile);
          if (!d.模块) item.错误 = `${segFile} 执行出错：${d.错误}`;
          else if (!d.模块.default) item.错误 = `${segFile} 没有 export default 定义段(...)`;
          else item.definition = d.模块.default as SegmentDef;
        }
        segments.push(item);
      }
      const sceneOrder: string[] = [];
      for (const s of segments) if (s.definition && s.definition.场 !== '核对' && !sceneOrder.includes(s.definition.场)) sceneOrder.push(s.definition.场);
      return { segments, sceneOrder };
    })();
    contentCache.set(c, r);
  }
  return r;
};

/** 所查作品的 段/、场/、核对/ 下实际有的目录名 */
export const listExistingDirs = (c: CheckContext, layerKind: '段' | '场' | '核对') => {
  const dirPrefix = c.workPath(`${layerKind}/`);
  return [...new Set(c.文件().filter((p) => p.startsWith(dirPrefix) && p.slice(dirPrefix.length).includes('/')).map((p) => p.slice(dirPrefix.length).split('/')[0]!))].sort();
};
