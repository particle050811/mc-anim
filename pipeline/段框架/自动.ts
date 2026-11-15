// film、still、studio 开跑前自动跑 anim cues：段框架的段生成的 声音表.生成.ts、声音地址.生成.ts 和 段.ts 的 cue 对不上就重新生成（变了才写）。
// 为什么自动生成、不是报错让人去跑：这两份文件只由 段.ts、场时间线、资产锁、台词.toml 和字节算出来，人去跑也是同一条命令、同一个结果；
// 报错的话 studio 起不来、改一声就要多敲一条命令。写了哪份会打出来（进 Git，git diff 看得见），anim check 照样核对。
// 只看一眼认得出的段（段.ts 直接引 窗口段，或目录里已经有生成的声音表；anim new seg 建的段一开始就有空表），不执行老段，开跑前不慢。
// 必须在 清单/清单.ts 的 全部段 之前跑：声音表过期时 放() 直接抛错，全部段 连加载都过不去。
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { codeRoot, relativeToCodeRoot } from '../环境/路径.ts';
import { workRoot } from '../环境/作品.ts';
import { dataRoot } from '../环境/配置.ts';
import { readWorkAssetLock } from '../资产/资产锁.ts';
import { readLineTable } from '../合成/台词落点.ts';
import type { ManifestEntry } from '../../engine/段/清单条目.ts';
import type { SegmentDef } from '../../engine/段/段定义.ts';
import { freshExec, generateSeg, type GenerateEnv } from './生成.ts';
import { isFrameworkSegDir } from './命令.ts';
import { getAudioMeasure } from './音频数.ts';

type WorkManifest = { manifest: readonly ManifestEntry[]; segDir: (segKey: string) => string };

export type AutoResult = { written: string[]; failed: Map<string, string> };

/** 所选作品里段框架的段逐个生成一遍（变了才写）；出错的不抛，记进 失败（段键 → 原因），由调用的命令决定要不要停 */
export const runCuesBeforeRender = async (o: { log?: (line: string) => void } = {}): Promise<AutoResult> => {
  const log = o.log ?? ((x: string) => console.error(x));
  const root = codeRoot();
  const workDir = workRoot();
  const m = (await import(pathToFileURL(path.join(workDir, '清单.ts')).href)) as WorkManifest;
  const segDirOf = (segKey: string) => path.join(workDir, ...m.segDir(segKey).split('/'));
  const frameworkSegs = m.manifest.filter((t) => isFrameworkSegDir(segDirOf(t.键)));
  const autoResult: AutoResult = { written: [], failed: new Map() };
  if (!frameworkSegs.length) return autoResult;
  const assetLock = readWorkAssetLock(workDir);
  const lineTable = readLineTable(path.join(workDir, '台词.toml'));
  const filmSegments = m.manifest.filter((t) => t.章 !== '核对');
  for (const t of frameworkSegs) {
    const i = filmSegments.findIndex((x) => x.键 === t.键);
    const prevSeg = async (): Promise<SegmentDef | undefined> => (i > 0 ? ((await freshExec(path.join(segDirOf(filmSegments[i - 1]!.键), '段.ts'), root)).default as SegmentDef) : undefined);
    const env: GenerateEnv = { assetLock, lineTable, getMeasure: (id) => getAudioMeasure(id, assetLock[id], dataRoot()), prevSeg };
    try {
      const r = await generateSeg(path.join(segDirOf(t.键), '段.ts'), root, env);
      if (r.changed.length) {
        const changedFiles = r.changed.map((f) => relativeToCodeRoot(path.join(segDirOf(t.键), f)));
        autoResult.written.push(...changedFiles);
        log(`✎ anim cues ${t.键}：段.ts 的 cue 和生成的文件对不上，重新生成了 ${r.changed.join('、')}`);
      }
    } catch (e) {
      autoResult.failed.set(t.键, (e as Error).message);
    }
  }
  return autoResult;
};

/** film、still 用：所选的段里有 cues 生成失败的就停（声音会放错），别的段失败只提醒 */
export const checkSelectedSegCues = (r: AutoResult, selected: readonly { 键: string }[], log: (line: string) => void = (x) => console.error(x)) => {
  const selectedKeys = new Set(selected.map((s) => s.键));
  const failed = [...r.failed].filter(([k]) => selectedKeys.has(k));
  for (const [k, x] of r.failed) if (!selectedKeys.has(k)) log(`!! ${k} 的 anim cues 没跑通（这次没选它，先不管）：${x}`);
  if (failed.length) throw new Error(`段框架的段生成声音表失败，声音会放错：${failed.map(([k, x]) => `${k}：${x}`).join('；')}`);
};
