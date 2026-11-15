// 保真范围：渲染时会把导入地形挖开或整平的地方（导入区段.ts 的 carveOut、flatten）。挖开以后露出来的格也算看得见，
// 所以这些范围碰到的区段（各级都算，四周多留 2 格）整块原样保留，四种变换都不碰。
//   node wasm/实验/地形可见/保真范围.ts <包名> <出：区段清单> > 汇总.json
// 范围是各出处挖框、整平罩的游戏坐标包围盒（x、z 两端都含，y 不管：区段是整列的），手抄的，出处改了要重抄：
// 暮色的挖框有 3803 个（多数是修边的小框），按地标取包围盒；边城的整平罩取罩的外框（城的体素范围外扩 16 格），竖井、古城的挖框都在它里面。
// 下界-无结构-1110 还有一处：作品/亚波伦不放水/场/1-台地/布局.ts 的 祭坛底挖（x 895～901、z −303～−297），这个包状态表里没有石头，原型没开它。
import fs from 'node:fs';
import path from 'node:path';
import { 数据根 } from '../../../pipeline/环境/配置.ts';
import { 载入, 开包, 键, terrain根, 包目录 } from './公共.ts';

type 范围 = { 名: string; 出处: string; 盒: [number, number, number, number] }; // [x0, z0, x1, z1]
const 地标 = '作品/应力转动/地点/暮色新世界/摆放.ts allCutouts';
export const 保真表: Record<string, 范围[]> = {
  '主世界-116': [
    { 名: '基地小岛 屋子', 出处: '作品/应力转动/地点/基地小岛.tsx digBoxes', 盒: [39731, -1140, 39747, -1122] },
    { 名: '基地小岛 水池和草坪', 出处: '作品/应力转动/地点/基地小岛.tsx digBoxes', 盒: [39672, -1335, 39681, -1326] },
    { 名: '边城 整平、竖井、古城', 出处: '作品/应力转动/地点/边城地基.ts borderTownFlatten、shaftCutouts', 盒: [8692, -5604, 9227, -5149] },
  ],
  '暮色放大-1752-扩展': [
    { 名: '娜迦庭院', 出处: 地标, 盒: [-11456, -951, -11133, -776] },
    { 名: '巫妖怪塔', 出处: 地标, 盒: [-9352, 952, -8962, 1117] },
    { 名: '九头蛇巢穴', 出处: 地标, 盒: [-6308, 2187, -6284, 2200] },
    { 名: '幽冥高塔', 出处: 地标, 盒: [-7215, 4997, -7105, 5131] },
    { 名: '雪怪洞窟', 出处: 地标, 盒: [-4022, 5157, -3866, 5229] },
    { 名: '极光宫殿', 出处: 地标, 盒: [-2959, 5095, -2903, 5170] },
    { 名: '终焉高原城堡（挖框和整平罩同一个外框）', 出处: `${地标}、allFlattens`, 盒: [-3984, 1992, -2959, 2307] },
    { 名: '云中小屋', 出处: 地标, 盒: [-3133, 3158, -2887, 3261] },
    { 名: '删掉的巨魔云 1', 出处: '摆放.ts twilightRemovedClouds', 盒: [-10286, 1882, -10183, 1981] },
    { 名: '删掉的巨魔云 2', 出处: '摆放.ts twilightRemovedClouds', 盒: [-4074, 1882, -3979, 1981] },
    { 名: '删掉的巨魔云 3', 出处: '摆放.ts twilightRemovedClouds', 盒: [-3042, 1110, -2947, 1209] },
    { 名: '删掉的巨魔云 4', 出处: '摆放.ts twilightRemovedClouds', 盒: [-2030, 1806, -1931, 1917] },
  ],
};

const [包名, 出] = process.argv.slice(2) as [string, string];
const 环 = await 载入(), 包 = 开包(环, terrain根(), 包名);
const [ox, , oz] = 包.info.原点 as [number, number, number];
// 游戏 (x, z) → 第 0 级的格 (x − 原点x, 原点z − 1 − z)，同 导入地形.ts 的 toSceneBox
const 留 = 2;
const 全 = new Set<string>();
const 汇总 = (保真表[包名] ?? []).map((r) => {
  const [x0, z0, x1, z1] = r.盒, a0 = x0 - ox, a1 = x1 - ox, b0 = oz - 1 - z1, b1 = oz - 1 - z0;
  const 级 = Array.from({ length: 7 }, () => ({ 段: 0, 字节: 0 })), 段键: string[] = [];
  for (let L = 0; L < 7; L++) {
    const s = 2 ** L, w = 32 * s;
    for (let j = Math.floor((b0 - 留 * s) / w); j <= Math.floor((b1 + 留 * s) / w); j++) for (let i = Math.floor((a0 - 留 * s) / w); i <= Math.floor((a1 + 留 * s) / w); i++) {
      const 项 = 包.查.get(键({ L, i, j }));
      if (!项) continue;
      级[L]!.段++; 级[L]!.字节 += 项.len;
      段键.push(键(项.id)); 全.add(键(项.id));
    }
  }
  return { ...r, 级, 段键 };
});
fs.writeFileSync(出, [...全].join('\n') + '\n');

// 哪些段真用到了这些区段：渲染时记下的用量（run/地形用量/<作品>/<段>.json，区段写成 L|i|j），版本对得上才算
const 用量根 = path.join(数据根(), 'run', '地形用量'), 版本 = path.basename(包目录[包名]!);
const 用到: Record<string, string[]> = {};
for (const 作品 of fs.existsSync(用量根) ? fs.readdirSync(用量根) : []) for (const f of fs.readdirSync(path.join(用量根, 作品)).filter((f) => f.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(用量根, 作品, f), 'utf8')) as { 段: string; 包: Record<string, { 版本: string; 区段: string[] }> };
  const p = j.包[包名];
  if (!p || p.版本 !== 版本) continue;
  const 有 = new Set(p.区段.map((k) => k.replaceAll('|', '/')));
  for (const r of 汇总) if (r.段键.some((k) => 有.has(k))) (用到[r.名] ??= []).push(`${作品}/${j.段}`);
}
const 全包级字节 = 包.级.map((b) => b.reduce((s, x) => s + x.len, 0));
const 保真级 = Array.from({ length: 7 }, (_, L) => { let 段 = 0, 字节 = 0; for (const k of 全) if (k.startsWith(`${L}/`)) { 段++; 字节 += 包.查.get(k)!.len; } return { L, 段, 字节, 占本级: 全包级字节[L] ? 字节 / 全包级字节[L]! : 0 }; });
const 保真字节 = 保真级.reduce((s, x) => s + x.字节, 0), 区段字节 = 全包级字节.reduce((a, b) => a + b, 0);
console.log(JSON.stringify({
  包: 包名, 版本, 原点: 包.info.原点, 四周留格: 留, 保真段数: 全.size, 保真字节, 占全包区段字节: 保真字节 / 区段字节, 保真级,
  范围: 汇总.map(({ 段键, 级, ...r }) => ({ ...r, 各级段数: 级.map((x) => x.段), 字节: 级.reduce((s, x) => s + x.字节, 0), 用到的段: (用到[r.名] ?? []).sort() })),
}, null, 1));
