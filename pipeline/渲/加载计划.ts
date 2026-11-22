// 加载计划：照段的地形视图（<段目录>/地形视图.ts，engine/voxel/地形视图.ts）在 Node 里算每个区段头一次用到的帧，不开页面。
// 读完整包优先（本机只有裁过的就读裁过的，readVersions 的 完整优先），存 <数据根>/cache/加载计划/<作品>/<段>.json，按计划指纹（段画面指纹去掉平台）认，旧了当场重算（一段几秒）。
// 裁级（anim world trim）、暮色航线烘焙（bake-far）、check 的缺级都读这一份（docs/世界.md「裁级」）。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PlanFirstUse } from '../../engine/voxel/加载计划.ts';
import type { TerrainViewDecl } from '../../engine/voxel/地形视图.ts';
import { segFps, segFrameCount } from '../../engine/段/段定义.ts';
import { importBundled } from '../源码/打包加载.ts';
import { codeRoot } from '../环境/路径.ts';
import { dataPath, terrainRoot } from '../环境/配置.ts';
import { workName, workRoot, listWorks, getSpecifiedWork, setSpecifiedWork } from '../环境/作品.ts';
import { loadAllSegments, type SegInfo } from '../清单/清单.ts';
import { stableJson } from '../指纹/指纹.ts';
import { readWorkAssetLock } from '../资产/资产锁.ts';
import { readVersions, terrainReadVersions } from './地形注入.ts';
import { decodeFrameRanges, readTerrainUsage, type TerrainUsageRecord } from './地形用量.ts';
import { readTerrainTable } from '../世界/版本.ts';
import { segmentProducts } from './段产物.ts';
import { nodeDataSource } from '../世界/node数据源.ts';

export const viewFile = (s: SegInfo) => path.join(s.目录, '地形视图.ts');
export const planFile = (work: string, segKey: string) => dataPath('cache', '加载计划', work, `${segKey}.json`);
/** 计划文件的格式：改了记法就加一，旧的当旧了重算 */
export const planFormat = 1;
export type SegPlan = { format: number; work: string; segment: string; planKey: string; frameCount: number; pack: Record<string, { version: string; sections: Record<string, number> }> };

/** 声明了地形包的段都要有地形视图：没有就不知道它读哪些区段，裁包、查缺级都没法算 */
const requireView = (s: SegInfo) => {
  if (!fs.existsSync(viewFile(s))) throw new Error(`${workName()}/${s.key} 声明了地形包（段.ts 的 terrain），没有 地形视图.ts：照 docs/新段.md「地形视图」写一份，画面读同一份`);
};

/** 计划指纹：段画面指纹去掉平台（Mac 和 Windows 算的一样）；段改了、引擎改了、地形包版本改了都会变 */
export const planKeys = async (allSegments: readonly SegInfo[], segments: readonly SegInfo[]) =>
  (await segmentProducts(allSegments, segments, '视频')).map((p) => crypto.createHash('sha256').update(stableJson({ ...p.pictureFingerprint.items, platform: undefined })).digest('hex'));

/** 段要读的地形包本机没有的（没 anim assets pull 的检出）：这样的段算不了计划 */
export const packsMissingLocally = (s: SegInfo) =>
  Object.entries(readVersions(terrainReadVersions(s.key, s.segment.terrain), '完整优先'))
    .filter(([pack, version]) => !fs.existsSync(path.join(terrainRoot(), pack, version)))
    .map(([pack]) => pack);

/** 当场算这几段（同一部作品）：所有视图打进一个包，three 只有一份、只过一次 esbuild */
export const planSegs = async (segs: readonly SegInfo[], keys: readonly string[] = segs.map(() => '')): Promise<SegPlan[]> => {
  if (!segs.length) return [];
  segs.forEach(requireView);
  const entry = [
    ...segs.map((s, i) => `export { default as v${i} } from ${JSON.stringify(viewFile(s))};`),
    `export { planSegment } from ${JSON.stringify(path.join(codeRoot(), 'engine/voxel/加载计划.ts'))};`,
  ].join('\n');
  const m = (await importBundled({ contents: entry, resolveDir: codeRoot() }, { codeRoot: codeRoot(), lock: readWorkAssetLock(workRoot()) })) as Record<string, TerrainViewDecl> & { planSegment: (typeof import('../../engine/voxel/加载计划.ts'))['planSegment'] };
  const src = nodeDataSource();
  const out: SegPlan[] = [];
  for (const [i, s] of segs.entries()) {
    const full = terrainReadVersions(s.key, s.segment.terrain);
    const dirs = readVersions(full, '完整优先');
    const dirOf = (pack: string) => {
      if (!dirs[pack]) throw new Error(`${s.key} 的地形视图读 ${pack}，段.ts 的 terrain 没声明`);
      return `terrain/${pack}/${dirs[pack]}`;
    };
    const frameCount = segFrameCount(s.segment, segFps);
    const first: PlanFirstUse = await m.planSegment(m[`v${i}`]!, frameCount, segFps, src, dirOf);
    const pack = Object.fromEntries(Object.entries(first).map(([p, sections]) => [p, { version: full[p]!, sections: Object.fromEntries(Object.entries(sections).sort(([x], [y]) => (x < y ? -1 : 1))) }]));
    out.push({ format: planFormat, work: workName(), segment: s.key, planKey: keys[i]!, frameCount, pack });
  }
  return out;
};

export const readPlan = (work: string, segKey: string): SegPlan | null => {
  const f = planFile(work, segKey);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as SegPlan) : null;
};

/** 这几段（当前作品）的计划：存着的指纹对得上就用，旧了、没有的当场算并存下；computed 是这次重算的段 */
export const freshPlans = async (allSegments: readonly SegInfo[], segs: readonly SegInfo[]): Promise<{ plans: SegPlan[]; computed: string[] }> => {
  segs.forEach(requireView);
  const keys = await planKeys(allSegments, segs);
  const saved = segs.map((s, i) => {
    const p = readPlan(workName(), s.key);
    return p && p.format === planFormat && p.planKey === keys[i] ? p : null;
  });
  const todo = segs.filter((_, i) => !saved[i]);
  const made = new Map((await planSegs(todo, todo.map((s) => keys[segs.indexOf(s)]!))).map((p) => [p.segment, p]));
  for (const p of made.values()) writePlan(p);
  return { plans: segs.map((s, i) => saved[i] ?? made.get(s.key)!), computed: [...made.keys()] };
};

/** 声明了这些包的段（所选作品里，按清单顺序） */
export const segsUsingPacks = (allSegments: readonly SegInfo[], packs: readonly string[]) => allSegments.filter((s) => s.segment.terrain.some((p) => packs.includes(p)));

/** 临时切到这部作品跑（anim cache gc 同样的做法），跑完切回去 */
export const inWork = async <T>(work: string, fn: () => Promise<T>): Promise<T> => {
  const prev = getSpecifiedWork();
  setSpecifiedWork(work);
  try {
    return await fn();
  } finally {
    setSpecifiedWork(prev);
  }
};

/** 各作品里声明了这个包的段的计划并起来：区段键 → 头一次用到它的（作品/段，帧） */
export const packPlan = async (pack: string, log: (s: string) => void = () => {}) => {
  const used = new Map<string, { work: string; segment: string; frame: number }>();
  let segCount = 0;
  for (const work of listWorks().keys()) {
    await inWork(work, async () => {
      const allSegments = await loadAllSegments();
      const segs = segsUsingPacks(allSegments, [pack]);
      if (!segs.length) return;
      segCount += segs.length;
      const { plans, computed } = await freshPlans(allSegments, segs);
      if (computed.length) log(`${work}：算了 ${computed.length} 段的加载计划（${computed.join('、')}）`);
      for (const p of plans) for (const [k, frame] of Object.entries(p.pack[pack]?.sections ?? {})) if (!used.has(k)) used.set(k, { work, segment: p.segment, frame });
    });
  }
  return { used, segCount };
};

const parentKey = (k: string) => {
  const [L, i, j] = k.split('|').map(Number) as [number, number, number];
  return `${L + 1}|${i >> 1}|${j >> 1}`;
};
const ancestry = (k: string, top: number) => {
  const out = [k];
  for (let x = k; Number(x.slice(0, x.indexOf('|'))) < top; ) out.push((x = parentKey(x)));
  return out;
};

/**
 * 和整段出片时页面记下的地形用量（渲/地形用量.ts）逐个区段比：地形视图和画面不是一份、改了一边忘了另一边，就对不上。返回不一样的说明，空 = 一样。
 * 普通包两边该一模一样。暮色航线包（登记了 policies / policyFrom 的）计划记世界的完整需求，页面记的是按包里有的级换过的（resolveSections 换成最近的祖先），
 * 所以只核：页面读的每块都是计划要的或它的祖先，计划要的每块页面都读了它或它的祖先。
 * 用量没有、或没记全段每一帧的（只出过几帧静帧），给 unknown：比不了，不算不一样
 */
export const compareWithUsage = (plan: SegPlan, usage: TerrainUsageRecord | null): { unknown: string } | { diffs: string[] } => {
  if (!usage) return { unknown: '没有地形用量（整段出片一次才有，<数据根>/run/地形用量/）' };
  const frames = new Set(decodeFrameRanges(usage.measuredFrames));
  const missingFrames = Array.from({ length: plan.frameCount }, (_, f) => f).filter((f) => !frames.has(f)).length;
  if (missingFrames) return { unknown: `地形用量只记了 ${plan.frameCount - missingFrames}/${plan.frameCount} 帧（整段出片一次才全）` };
  const table = readTerrainTable().pack;
  const out: string[] = [];
  const packs = new Set([...Object.keys(plan.pack), ...Object.entries(usage.pack).filter(([, u]) => u.sections.length).map(([p]) => p)]);
  for (const pack of packs) {
    const planned = plan.pack[pack], used = usage.pack[pack];
    if (planned && used && planned.version !== used.version) {
      out.push(`${plan.segment} ${pack}：版本 计划 ${planned.version}、出片 ${used.version}`);
      continue;
    }
    const P = new Set(Object.keys(planned?.sections ?? {})), U = new Set(used?.sections ?? []);
    const entry = table[pack];
    const resolved = !!entry && ('policies' in entry || 'policyFrom' in entry);
    let onlyUsage: string[], onlyPlan: string[];
    if (!resolved) {
      onlyUsage = [...U].filter((k) => !P.has(k));
      onlyPlan = [...P].filter((k) => !U.has(k));
    } else {
      const top = Math.max(0, ...[...P, ...U].map((k) => Number(k.slice(0, k.indexOf('|')))));
      const planAncestry = new Set([...P].flatMap((k) => ancestry(k, top)));
      onlyUsage = [...U].filter((k) => !planAncestry.has(k));
      onlyPlan = [...P].filter((k) => !ancestry(k, top).some((x) => U.has(x)));
    }
    if (onlyUsage.length || onlyPlan.length)
      out.push(`${plan.segment} ${pack}：计划 ${P.size}、出片 ${U.size}；出片读了计划没有的 ${onlyUsage.length}（${onlyUsage.slice(0, 4).join(' ')}）、计划有出片没读的 ${onlyPlan.length}（${onlyPlan.slice(0, 4).map((k) => `${k}@${planned!.sections[k]}`).join(' ')}）`);
  }
  return { diffs: out };
};

/** 用量是不是这一版段整段出片时记的（指纹对得上）：对得上才能拿来核计划，段改过了对不上是正常的 */
export const usageIsCurrent = async (allSegments: readonly SegInfo[], segs: readonly SegInfo[]) => {
  const products = await segmentProducts(allSegments, segs, '视频');
  return segs.map((s, i) => {
    const usage = readTerrainUsage(workName(), s.key);
    return { segment: s, usage, current: !!usage && usage.fingerprint === products[i]!.pictureFingerprint.fingerprint };
  });
};

export const writePlan = (plan: SegPlan) => {
  const f = planFile(plan.work, plan.segment);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(plan));
  return f;
};
