// anim world plan：照段的地形视图（<段目录>/地形视图.ts，engine/voxel/地形视图.ts）在 Node 里算加载计划，不开页面。
// 读法同地形覆盖（完整包优先，本机只有裁过的就读裁过的），存 <数据根>/cache/加载计划/<作品>/<段>.json，格式同覆盖的 pack。
import fs from 'node:fs';
import path from 'node:path';
import type { PlanFirstUse } from '../../../engine/voxel/加载计划.ts';
import type { TerrainViewDecl } from '../../../engine/voxel/地形视图.ts';
import { segFps, segFrameCount } from '../../../engine/段/段定义.ts';
import { importBundled } from '../../验收/打包加载.ts';
import { codeRoot } from '../../环境/路径.ts';
import { dataPath } from '../../环境/配置.ts';
import { workName, workRoot } from '../../环境/作品.ts';
import type { SegInfo } from '../../清单/清单.ts';
import { readWorkAssetLock } from '../../资产/资产锁.ts';
import { readVersions, terrainReadVersions } from '../../渲/地形注入.ts';
import { readCover } from '../../渲/地形覆盖.ts';
import { nodeDataSource } from '../node数据源.ts';

export const viewFile = (s: SegInfo) => path.join(s.目录, '地形视图.ts');
export const planFile = (work: string, segKey: string) => dataPath('cache', '加载计划', work, `${segKey}.json`);
export type SegPlan = { work: string; segment: string; frameCount: number; pack: Record<string, { version: string; sections: Record<string, number> }> };

export const planSeg = async (s: SegInfo): Promise<SegPlan> => {
  const o = { codeRoot: codeRoot(), lock: readWorkAssetLock(workRoot()) };
  // 引擎和视图同一份打包里取，three 只有一份
  const entry = `export { default as view } from ${JSON.stringify(viewFile(s))};\nexport { planSegment } from ${JSON.stringify(path.join(codeRoot(), 'engine/voxel/加载计划.ts'))};`;
  const m = (await importBundled({ contents: entry, resolveDir: s.目录 }, o)) as { view: TerrainViewDecl; planSegment: (typeof import('../../../engine/voxel/加载计划.ts'))['planSegment'] };
  const declared = s.segment.terrain;
  const full = terrainReadVersions(s.key, declared);
  const dirs = readVersions(full, '完整优先');
  const dirOf = (pack: string) => {
    if (!dirs[pack]) throw new Error(`${s.key} 的地形视图读 ${pack}，段.ts 的 terrain 没声明`);
    return `terrain/${pack}/${dirs[pack]}`;
  };
  const frameCount = segFrameCount(s.segment, segFps);
  const first: PlanFirstUse = await m.planSegment(m.view, frameCount, segFps, nodeDataSource(), dirOf);
  return { work: workName(), segment: s.key, frameCount, pack: Object.fromEntries(Object.entries(first).map(([pack, sections]) => [pack, { version: full[pack]!, sections }])) };
};

/** 和地形覆盖逐个区段比：返回不一样的说明，空 = 一样 */
export const compareWithCover = (plan: SegPlan): string[] => {
  const cover = readCover(plan.work, plan.segment);
  if (!cover) return [`${plan.segment}：没有地形覆盖可比（anim world cover ${plan.segment}）`];
  const out: string[] = [];
  if (cover.frameCount !== plan.frameCount) out.push(`${plan.segment}：帧数 覆盖 ${cover.frameCount}、计划 ${plan.frameCount}`);
  for (const pack of new Set([...Object.keys(cover.pack), ...Object.keys(plan.pack)])) {
    const a = cover.pack[pack]?.sections ?? {}, b = plan.pack[pack]?.sections ?? {};
    if (cover.pack[pack] && plan.pack[pack] && cover.pack[pack].version !== plan.pack[pack].version) out.push(`${plan.segment} ${pack}：版本 覆盖 ${cover.pack[pack].version}、计划 ${plan.pack[pack].version}`);
    const onlyCover = Object.keys(a).filter((k) => !(k in b)), onlyPlan = Object.keys(b).filter((k) => !(k in a));
    const moved = Object.keys(a).filter((k) => k in b && a[k] !== b[k]);
    if (onlyCover.length || onlyPlan.length || moved.length)
      out.push(`${plan.segment} ${pack}：覆盖 ${Object.keys(a).length}、计划 ${Object.keys(b).length}；只覆盖有 ${onlyCover.length}（${onlyCover.slice(0, 4).map((k) => `${k}@${a[k]}`).join(' ')}）、只计划有 ${onlyPlan.length}（${onlyPlan.slice(0, 4).map((k) => `${k}@${b[k]}`).join(' ')}）、首帧不同 ${moved.length}（${moved.slice(0, 4).map((k) => `${k} ${a[k]}→${b[k]}`).join(' ')}）`);
  }
  return out;
};

export const writePlan = (plan: SegPlan) => {
  const f = planFile(plan.work, plan.segment);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(plan));
  return f;
};
