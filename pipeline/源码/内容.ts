// 检查用的内容视图：执行所查作品的 清单.ts 和各段 段.ts（纯模块），按清单顺序给出每段的定义；场键的先后按清单里第一次出现排。
// 也读作品的 台词.toml（检查和 分发/随仓库.ts 共用）。
import type { SegmentDef } from '../../engine/段/段定义.ts';
import type { LineEntry } from '../配音/台词表.ts';
import type { CheckContext, CheckReport } from './上下文.ts';

export type ManifestLine = { key: string; 章: number | '核对'; 集?: number };
export type SegItem = ManifestLine & { 目录: string; segmentFile: string; definition?: SegmentDef; errors?: string };
export type ParsedContent = { segments: SegItem[]; sceneOrder: string[] } | { errors: string };

const contentCache = new WeakMap<CheckContext, Promise<ParsedContent>>();

export const readContent = (c: CheckContext): Promise<ParsedContent> => {
  let r = contentCache.get(c);
  if (!r) {
    r = (async (): Promise<ParsedContent> => {
      const manifestPath = c.workPath('清单.ts');
      if (!c.exists(manifestPath)) return { errors: `没有 ${manifestPath}` };
      const m = await c.loadModule(manifestPath);
      if (!m.modules) return { errors: `${manifestPath} 执行出错：${m.errors}` };
      const manifestRows = m.modules.manifest as ManifestLine[] | undefined;
      const segDir = m.modules.segDir as ((segKey: string) => string) | undefined;
      if (!Array.isArray(manifestRows) || typeof segDir !== 'function') return { errors: `${manifestPath} 要导出 manifest 数组和 segDir 函数` };
      const segments: SegItem[] = [];
      for (const t of manifestRows) {
        const absSegDir = c.workPath(segDir(t.key));
        const segFile = `${absSegDir}/段.ts`;
        const item: SegItem = { ...t, 目录: absSegDir, segmentFile: segFile };
        if (!c.exists(segFile)) item.errors = `缺 ${segFile}`;
        else {
          const d = await c.loadModule(segFile);
          if (!d.modules) item.errors = `${segFile} 执行出错：${d.errors}`;
          else if (!d.modules.default) item.errors = `${segFile} 没有 export default defineSeg(...)`;
          else item.definition = d.modules.default as SegmentDef;
        }
        segments.push(item);
      }
      const sceneOrder: string[] = [];
      for (const s of segments) if (s.definition && s.definition.scene !== '核对' && !sceneOrder.includes(s.definition.scene)) sceneOrder.push(s.definition.scene);
      return { segments, sceneOrder };
    })();
    contentCache.set(c, r);
  }
  return r;
};

/** 所查作品的 段/、场/、核对/ 下实际有的目录名 */
export const listExistingDirs = (c: CheckContext, layerKind: '段' | '场' | '核对') => {
  const dirPrefix = c.workPath(`${layerKind}/`);
  return [...new Set(c.file().filter((p) => p.startsWith(dirPrefix) && p.slice(dirPrefix.length).includes('/')).map((p) => p.slice(dirPrefix.length).split('/')[0]!))].sort();
};

export const lineTablePath = (c: CheckContext) => c.workPath('台词.toml');

export const readLineTable = (c: CheckContext, report?: CheckReport): LineEntry[] | null => {
  const path = lineTablePath(c);
  if (!c.exists(path)) return null;
  try {
    return ((c.readToml(path)!['lines'] ?? []) as LineEntry[]);
  } catch (e) {
    report?.错(`TOML 解析失败：${(e as Error).message.split('\n')[0]}`, path);
    return null;
  }
};
