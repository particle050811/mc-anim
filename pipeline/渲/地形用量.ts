// 地形用量：每段实际读了哪些地形包和区段，页面记（engine/voxel/地形用量.ts），这里关页面前收走，累积进 <数据根>/run/地形用量/<作品>/<段键>.json：
//   { 作品, 段, 指纹?, 已量帧: "0-99,620", 包: { <包>: { 版本, 区段: ["L|i|j", …] } }, 更新于 }
// 接法：开浏览器后调一次 收地形用量(browser)，渲染传 段渲染环境（地形注入.ts），每次渲完 记已量帧，关浏览器前 等地形用量写完。开会话、anim bench 已接好。
// 只记不读，这里的文件出什么错（占用、坏 JSON）都只报警告，不抛给渲染：Windows 上连写同一文件 rename 容易 EPERM，不能为一份记录丢掉渲完的段。
// 多次渲染按并集累积（抽帧、逐帧校验、bench 都往里加）。整段重渲前 开始整段量 清掉旧记录并记下指纹，渲完才是这个指纹全部帧的准数；之后的 bench、still 只会往上加。
// 某个包的版本和记录的不一样：那个包的区段作废重记，已量帧清零。
import fs from 'node:fs';
import type { HeadlessBrowser } from '@remotion/renderer';
import { terrainUsageSegEnv } from '../../engine/段/地形环境.ts';
import { workName } from '../环境/作品.ts';
import { dataPath } from '../环境/配置.ts';
import { atomicWrite } from './母版.ts';
import { beforeClose } from './求解缓存收集.ts';

export type PageUsage = Record<string, { 版本: string; 区段: string[] }>;
export type TerrainUsageRecord = { 作品: string; 段: string; 指纹?: string; 已量帧: string; 包: PageUsage; 更新于: string };

export const terrainUsageFile = (work: string, segKey: string) => dataPath('run', '地形用量', work, `${segKey}.json`);

/** 帧号 → "0-99,620"（升序去重，连续的并成一段） */
export const encodeFrameRanges = (frames: Iterable<number>): string => {
  const sortedFrames = [...new Set(frames)].sort((a, b) => a - b);
  const frameSegs: string[] = [];
  for (let i = 0; i < sortedFrames.length; ) {
    let j = i;
    while (j + 1 < sortedFrames.length && sortedFrames[j + 1] === sortedFrames[j]! + 1) j++;
    frameSegs.push(i === j ? `${sortedFrames[i]}` : `${sortedFrames[i]}-${sortedFrames[j]}`);
    i = j + 1;
  }
  return frameSegs.join(',');
};
export const decodeFrameRanges = (rangeText: string): number[] =>
  rangeText === ''
    ? []
    : rangeText.split(',').flatMap((x) => {
        const [a, b] = x.split('-').map(Number) as [number, number | undefined];
        return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i);
      });

const sectionCoords = (k: string) => k.split('|').map(Number);
const sortSections = (sectionKeys: Iterable<string>) =>
  [...new Set(sectionKeys)].sort((a, b) => {
    const [x, y] = [sectionCoords(a), sectionCoords(b)];
    return x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]!;
  });

/** 纯函数：旧记录并上一页的用量和这次量完的帧 */
export const mergeUsage = (prevUsage: Omit<TerrainUsageRecord, '更新于'>, pageUsage: PageUsage, frames: Iterable<number> = []): Omit<TerrainUsageRecord, '更新于'> => {
  const packs: PageUsage = { ...prevUsage.包 };
  let measured = decodeFrameRanges(prevUsage.已量帧);
  for (const [packName, nextUsage] of Object.entries(pageUsage)) {
    const oldEntry = packs[packName];
    if (oldEntry && oldEntry.版本 !== nextUsage.版本) measured = [];
    packs[packName] = { 版本: nextUsage.版本, 区段: sortSections([...(oldEntry?.版本 === nextUsage.版本 ? oldEntry.区段 : []), ...nextUsage.区段]) };
  }
  return { ...prevUsage, 包: packs, 已量帧: encodeFrameRanges([...measured, ...frames]) };
};

export const readTerrainUsage = (work: string, segKey: string): TerrainUsageRecord | null => {
  const f = terrainUsageFile(work, segKey);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as TerrainUsageRecord) : null;
};

const writeTerrainUsage = (work: string, segKey: string, r: Omit<TerrainUsageRecord, '更新于'>) => atomicWrite(terrainUsageFile(work, segKey), `${JSON.stringify({ ...r, 更新于: new Date().toISOString() })}\n`);
const accumulate = (work: string, segKey: string, pageUsage: PageUsage, frames: Iterable<number> = []) => writeTerrainUsage(work, segKey, mergeUsage(readTerrainUsage(work, segKey) ?? { 作品: work, 段: segKey, 已量帧: '', 包: {} }, pageUsage, frames));

const warnOnly = (segKey: string, fn: () => void) => {
  try {
    fn();
  } catch (e) {
    console.error(`!! ${segKey} 的地形用量没记上（${(e as Error).message.split('\n')[0]}），不影响渲染；这份记录不准，整段重渲会重记`);
  }
};

const inFlight = new Set<Promise<void>>();
export const waitTerrainUsageWrites = () => Promise.all([...inFlight]);

// 没读过地形的段不留文件：记录还不在就先攒着，等它的页面关掉时一起落盘
const pendingFrames = new Map<string, number[]>();
const pendingFingerprints = new Map<string, string>();

/** 这次渲完了这些帧（段内帧号）。先等页面的用量落盘，版本换了要清零的顺序才对。渲到一半失败不要调：已量帧只算真渲完的 */
export const recordMeasuredFrames = async (segKey: string, frames: readonly number[], work = workName()) => {
  await waitTerrainUsageWrites();
  warnOnly(segKey, () => {
    if (readTerrainUsage(work, segKey)) return accumulate(work, segKey, {}, frames);
    const k = `${work}/${segKey}`;
    pendingFrames.set(k, [...(pendingFrames.get(k) ?? []), ...frames]);
  });
};

/** 整段重渲前：旧记录不算数了（镜头可能改过），记下这次的指纹 */
export const startWholeMeasure = (segKey: string, fingerprint: string, work = workName()) => {
  warnOnly(segKey, () => fs.rmSync(terrainUsageFile(work, segKey), { force: true }));
  pendingFrames.delete(`${work}/${segKey}`);
  pendingFingerprints.set(`${work}/${segKey}`, fingerprint);
};

const collectPageExpr = `JSON.stringify({ 段: window.process?.env?.[${JSON.stringify(terrainUsageSegEnv)}] ?? null, 包: Object.fromEntries([...(window.terrainUsage ?? new Map())].map(([名, v]) => [名, { 版本: v.版本, 区段: [...v.区段] }])) })`;

/** 接到浏览器上：之后每个页面关掉前收走它的用量。读 Composition 列表的页面没传段名，不记 */
export const collectTerrainUsage = (browser: HeadlessBrowser) =>
  beforeClose(browser, inFlight, async (evaluate) => {
    const { 段: workSegKey, 包: packs } = JSON.parse(await evaluate(collectPageExpr)) as { 段: string | null; 包: PageUsage };
    if (!workSegKey || !Object.keys(packs).length) return;
    const slashIndex = workSegKey.indexOf('/');
    const [work, segKey] = [workSegKey.slice(0, slashIndex), workSegKey.slice(slashIndex + 1)];
    const frames = pendingFrames.get(workSegKey) ?? [];
    pendingFrames.delete(workSegKey);
    const fingerprint = pendingFingerprints.get(workSegKey);
    warnOnly(segKey, () => {
      if (fingerprint) {
        pendingFingerprints.delete(workSegKey);
        writeTerrainUsage(work, segKey, mergeUsage({ 作品: work, 段: segKey, 指纹: fingerprint, 已量帧: '', 包: {} }, packs, frames));
      } else accumulate(work, segKey, packs, frames);
    });
  });
