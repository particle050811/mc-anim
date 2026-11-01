// 地形用量：每段实际读了哪些地形包和区段，页面记（engine/voxel/地形用量.ts），这里关页面前收走，累积进 <数据根>/run/地形用量/<作品>/<段键>.json：
//   { 作品, 段, 指纹?, 已量帧: "0-99,620", 包: { <包>: { 版本, 区段: ["L|i|j", …] } }, 更新于 }
// 接法：开浏览器后调一次 收地形用量(browser)，渲染传 段渲染环境（地形注入.ts），每次渲完 记已量帧，关浏览器前 等地形用量写完。开会话、anim bench 已接好。
// 多次渲染按并集累积（抽帧、逐帧校验、bench 都往里加）。整段重渲前 开始整段量 清掉旧记录并记下指纹，渲完才是这个指纹全部帧的准数；之后的 bench、still 只会往上加。
// 某个包的版本和记录的不一样：那个包的区段作废重记，已量帧清零。
import fs from 'node:fs';
import type { HeadlessBrowser } from '@remotion/renderer';
import { 地形用量段环境名 } from '../../engine/段/地形环境.ts';
import { 作品名 } from '../环境/作品.ts';
import { 数据路径 } from '../环境/配置.ts';
import { 原子写 } from './母版.ts';
import { 关页前 } from './求解缓存收集.ts';

export type 页面用量 = Record<string, { 版本: string; 区段: string[] }>;
export type 地形用量记录 = { 作品: string; 段: string; 指纹?: string; 已量帧: string; 包: 页面用量; 更新于: string };

export const 地形用量文件 = (作品: string, 键: string) => 数据路径('run', '地形用量', 作品, `${键}.json`);

/** 帧号 → "0-99,620"（升序去重，连续的并成一段） */
export const 帧段串 = (帧们: Iterable<number>): string => {
  const 序 = [...new Set(帧们)].sort((a, b) => a - b);
  const 段: string[] = [];
  for (let i = 0; i < 序.length; ) {
    let j = i;
    while (j + 1 < 序.length && 序[j + 1] === 序[j]! + 1) j++;
    段.push(i === j ? `${序[i]}` : `${序[i]}-${序[j]}`);
    i = j + 1;
  }
  return 段.join(',');
};
export const 解帧段串 = (串: string): number[] =>
  串 === ''
    ? []
    : 串.split(',').flatMap((x) => {
        const [a, b] = x.split('-').map(Number) as [number, number | undefined];
        return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i);
      });

const 区段序 = (k: string) => k.split('|').map(Number);
const 排区段 = (键们: Iterable<string>) =>
  [...new Set(键们)].sort((a, b) => {
    const [x, y] = [区段序(a), 区段序(b)];
    return x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]!;
  });

/** 纯函数：旧记录并上一页的用量和这次量完的帧 */
export const 并入用量 = (旧: Omit<地形用量记录, '更新于'>, 页: 页面用量, 帧们: Iterable<number> = []): Omit<地形用量记录, '更新于'> => {
  const 包: 页面用量 = { ...旧.包 };
  let 已量 = 解帧段串(旧.已量帧);
  for (const [名, 新] of Object.entries(页)) {
    const 老 = 包[名];
    if (老 && 老.版本 !== 新.版本) 已量 = [];
    包[名] = { 版本: 新.版本, 区段: 排区段([...(老?.版本 === 新.版本 ? 老.区段 : []), ...新.区段]) };
  }
  return { ...旧, 包, 已量帧: 帧段串([...已量, ...帧们]) };
};

export const 读地形用量 = (作品: string, 键: string): 地形用量记录 | null => {
  const f = 地形用量文件(作品, 键);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as 地形用量记录) : null;
};

const 写入 = (作品: string, 键: string, r: Omit<地形用量记录, '更新于'>) => 原子写(地形用量文件(作品, 键), `${JSON.stringify({ ...r, 更新于: new Date().toISOString() })}\n`);
const 累积 = (作品: string, 键: string, 页: 页面用量, 帧们: Iterable<number> = []) => 写入(作品, 键, 并入用量(读地形用量(作品, 键) ?? { 作品, 段: 键, 已量帧: '', 包: {} }, 页, 帧们));

const 在收 = new Set<Promise<void>>();
export const 等地形用量写完 = () => Promise.all([...在收]);

// 没读过地形的段不留文件：记录还不在就先攒着，等它的页面关掉时一起落盘
const 待记帧 = new Map<string, number[]>();
const 待指纹 = new Map<string, string>();

/** 这次渲完了这些帧（段内帧号）。先等页面的用量落盘，版本换了要清零的顺序才对。渲到一半失败不要调：已量帧只算真渲完的 */
export const 记已量帧 = async (键: string, 帧们: readonly number[], 作品 = 作品名()) => {
  await 等地形用量写完();
  if (读地形用量(作品, 键)) return 累积(作品, 键, {}, 帧们);
  const k = `${作品}/${键}`;
  待记帧.set(k, [...(待记帧.get(k) ?? []), ...帧们]);
};

/** 整段重渲前：旧记录不算数了（镜头可能改过），记下这次的指纹 */
export const 开始整段量 = (键: string, 指纹: string, 作品 = 作品名()) => {
  fs.rmSync(地形用量文件(作品, 键), { force: true });
  待记帧.delete(`${作品}/${键}`);
  待指纹.set(`${作品}/${键}`, 指纹);
};

const 收页表达式 = `JSON.stringify({ 段: window.process?.env?.[${JSON.stringify(地形用量段环境名)}] ?? null, 包: Object.fromEntries([...(window.__地形用量 ?? new Map())].map(([名, v]) => [名, { 版本: v.版本, 区段: [...v.区段] }])) })`;

/** 接到浏览器上：之后每个页面关掉前收走它的用量。读 Composition 列表的页面没传段名，不记 */
export const 收地形用量 = (browser: HeadlessBrowser) =>
  关页前(browser, 在收, async (求值) => {
    const { 段, 包 } = JSON.parse(await 求值(收页表达式)) as { 段: string | null; 包: 页面用量 };
    if (!段 || !Object.keys(包).length) return;
    const 斜 = 段.indexOf('/');
    const [作品, 键] = [段.slice(0, 斜), 段.slice(斜 + 1)];
    const 帧们 = 待记帧.get(段) ?? [];
    待记帧.delete(段);
    const 指纹 = 待指纹.get(段);
    if (指纹) {
      待指纹.delete(段);
      写入(作品, 键, 并入用量({ 作品, 段: 键, 指纹, 已量帧: '', 包: {} }, 包, 帧们));
    } else 累积(作品, 键, 包, 帧们);
  });
