// 6-3-6 砸穿：锤底碰到哪一层，哪一层才碎（用户 10-10 嫌「还没碰到就砸穿了」）。
// 坑和竖井是游戏里挖好导出的整块网格（竖井.tsx 的 `ShaftWalls`），整块一起出现会让井一下子全通；所以挖开的每一格在挖之前是什么方块
// （竖井4x.填块.json，挖竖井.py 世界=4x 读 片场-古城4x 存档算的；地表一截是赤陶），场景里先照原样填上；
// 锤底（压路机虚影滚筒最低点，见 `maceBottomZ`）碰到这一格顶面，这一格才碎（`breakSecAt`），碎块（碎块.tsx）也从碎掉的格子、在那一刻崩出来。
// 井里锤底一帧走 2.3～3.7 格（入井 88 米/秒、打穿洞顶 55 米/秒，编排.ts 的 `liYingShaft`），所以按每格自己的碎掉时刻算、不按帧：不漏层、不提前、任意一帧单独渲染结果一样。
import React, { useMemo } from 'react';
import { getInputProps } from 'remotion';
import * as THREE from 'three';
import * as choreo from './编排.ts';
import { FPS, 撞击时刻, 段表, 物理时间, 撞击段内帧 } from './时间线.ts';
import { blockMaterial, blockPngs, type 方块贴图名 } from './竖井.tsx';
import fillData资产 from 'asset:数据/镜头/6-3-下坠/竖井4x.填块';
const fillData = fillData资产 as unknown as any; // 迁移：类型待补

// ---------- 锤底 ----------
// 最先碰到方块的是锤头上压路机虚影的滚筒（锤竖直朝下、领在最前面），轴水平左右，所以最低点 = 滚筒中心往下一个半径，和 编排.ts 算撞击时刻的 `strikeDepth` 是同一个点。
// 用李樱每一刻实际姿势算（撞上以后锤还在微微往下压），不用固定的 `strikeDepth`
export const maceBottomZ = (w: number) => choreo.maceHeadPos(choreo.liYing(w))[2] - choreo.rollerRadius;

// 撞击到落进古城这一段，每 1/4800 秒记一次锤底高度（取一路的最低值，单调往下），碎于 在里面查
let TAB: { w0: number; dt: number; z: number[] } | null = null;
const tab = () => {
  if (TAB) return TAB;
  const w0 = 撞击时刻();
  const end = choreo.liYingShaft().落地;
  const dt = 1 / 4800;
  const z: number[] = [];
  let runningMin = Infinity;
  for (let i = 0; w0 + i * dt <= end + dt; i++) {
    runningMin = Math.min(runningMin, maceBottomZ(w0 + i * dt));
    z.push(runningMin);
  }
  // 撞击时刻就是锤底碰到城的地面（石半砖顶面）的那一刻（时间线.ts 的 设置撞击），两边算的是同一个点，对不上说明哪边改了
  if (Math.abs(z[0] - choreo.groundZ) > 0.02) throw new Error(`填块.tsx：撞击时刻锤底在 ${z[0].toFixed(3)}，不在城的地面 ${choreo.groundZ}`);
  TAB = { w0, dt, z };
  return TAB;
};
// 锤底往下碰到高度 顶z 的时刻（物理时间）。撞击以前锤底在地面以上，所以城的地面那一层（顶面 = 地面z）就在撞击时刻碎；碰不到的给 Infinity
export const breakSecAt = (topZ: number) => {
  const table = tab();
  if (topZ >= choreo.groundZ - 1e-6) return table.w0;
  const z = table.z;
  if (z[z.length - 1] > topZ) return Infinity;
  let lo = 0;
  let hi = z.length - 1; // z[lo] > 顶z ≥ z[hi]
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (z[mid] > topZ) lo = mid;
    else hi = mid;
  }
  return table.w0 + (lo + (z[lo] - topZ) / (z[lo] - z[hi])) * table.dt;
};
// 锤底往下的速度（米/秒），碎块初速度按它算。往后取差分：撞地那一下速度从 360 跳到入井的 88（编排.ts 的 `入井速度`），碎块要撞上以后的
export const maceBottomSpeed = (w: number) => (maceBottomZ(w) - maceBottomZ(w + 0.002)) / 0.002;

// ---------- 填回去的格子 ----------
const texByBlock: Record<string, { 顶: 方块贴图名; 侧: 方块贴图名 }> = {
  'minecraft:stone': { 顶: '石头', 侧: '石头' },
  'minecraft:deepslate': { 顶: '深板岩顶', 侧: '深板岩' },
  'minecraft:dirt': { 顶: '泥土', 侧: '泥土' },
  'minecraft:smooth_stone_slab': { 顶: '平滑石头', 侧: '平滑石台阶侧' },
  'create:asurine': { 顶: '皓蓝石', 侧: '皓蓝石' },
  'minecraft:granite': { 顶: '花岗岩', 侧: '花岗岩' },
  'minecraft:andesite': { 顶: '安山岩', 侧: '安山岩' },
  'minecraft:diorite': { 顶: '闪长岩', 侧: '闪长岩' },
  'minecraft:gravel': { 顶: '砂砾', 侧: '砂砾' },
  'minecraft:sculk': { 顶: '幽匿块', 侧: '幽匿块' },
  'minecraft:calcite': { 顶: '方解石', 侧: '方解石' },
  'minecraft:tuff': { 顶: '凝灰岩', 侧: '凝灰岩' },
  'minecraft:coal_ore': { 顶: '煤矿石', 侧: '煤矿石' },
  'minecraft:copper_ore': { 顶: '铜矿石', 侧: '铜矿石' },
  'minecraft:gold_ore': { 顶: '金矿石', 侧: '金矿石' },
  'minecraft:redstone_ore': { 顶: '红石矿石', 侧: '红石矿石' },
  'minecraft:deepslate_copper_ore': { 顶: '深层铜矿石', 侧: '深层铜矿石' },
  'minecraft:deepslate_gold_ore': { 顶: '深层金矿石', 侧: '深层金矿石' },
  'minecraft:terracotta': { 顶: '赤陶', 侧: '赤陶' },
  'minecraft:orange_terracotta': { 顶: '橙色赤陶', 侧: '橙色赤陶' },
  'minecraft:yellow_terracotta': { 顶: '黄色赤陶', 侧: '黄色赤陶' },
  'minecraft:red_terracotta': { 顶: '红色赤陶', 侧: '红色赤陶' },
  'create:zinc_ore': { 顶: '锌矿石', 侧: '锌矿石' },
  'iceandfire:silver_ore': { 顶: '银矿石', 侧: '银矿石' },
};
export const SLAB_Y = fillData.石半砖y; // 城的石半砖（下半砖），高半格（老片场 73、新世界 135）
export const ORIGIN_Y = fillData.原点y; // 竖井网格原点的游戏 y（场景 z 0；= SLAB_Y − 10）
export type 填格 = { dx: number; dy: number; y: number; 底z: number; 顶z: number; 方块: string; 顶: 方块贴图名; 侧: 方块贴图名; 碎: number };
let CELLS: 填格[] | null = null;
// 场景 z：竖井网格放在 z 0（= 游戏 y 原点y，见 竖井.tsx），格子底面 = y − 原点y
export const fillCells = (): 填格[] => {
  if (CELLS) return CELLS;
  CELLS = (fillData.格 as [number, number, number, string][]).map(([dx, dy, y, blockId]) => {
    const t = texByBlock[blockId];
    if (!t) throw new Error(`填块.tsx：${blockId} 没有对应的贴图，加到 贴图 表和 取材清单 的「6-3方块贴图」里`);
    const bottomZ = y - ORIGIN_Y;
    const topZ = bottomZ + (y === SLAB_Y ? 0.5 : 1);
    return { dx, dy, y, 底z: bottomZ, 顶z: topZ, 方块: blockId, ...t, 碎: breakSecAt(topZ) };
  });
  return CELLS;
};

// ---------- 画：还没碎的格子 ----------
// 和竖井网格同一个原点（井心正下方 z 0），放同一个 group。按（顶面贴图、侧面贴图、整格还是半格）分组画实例，每帧只放还没碎的。
// 填的方块和网格井壁贴着：填块侧面和井壁朝井里的面在同一平面上、朝向相反，从井里往下看只看得到最上面那层的顶面
const boxFull = new THREE.BoxGeometry(1, 1, 1);
const boxSlab = new THREE.BoxGeometry(1, 1, 0.5);
export const ShaftFill: React.FC<{ w: number }> = ({ w: physSec }) => {
  const groups = useMemo(() => {
    const by = new Map<string, 填格[]>();
    for (const cell of fillCells()) {
      const k = `${cell.顶}|${cell.侧}|${cell.y === SLAB_Y ? 1 : 0}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push(cell);
    }
    return [...by.entries()].map(([k, list]) => {
      const [topTex, sideTex, half] = k.split('|');
      const top = blockMaterial(blockPngs[topTex as 方块贴图名]);
      const side = blockMaterial(blockPngs[sideTex as 方块贴图名]);
      // BoxGeometry 的面：+x、−x、+y、−y、+z（顶）、−z（底）
      const mesh = new THREE.InstancedMesh(half === '1' ? boxSlab : boxFull, [side, side, side, side, top, top], list.length);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      return { m: mesh, list };
    });
  }, []);
  const dummy = new THREE.Object3D();
  for (const { m: mesh, list } of groups) {
    let count = 0;
    for (const cell of list) {
      if (cell.碎 <= physSec + 1e-9) continue; // 1e-9：撞击那一帧的物理时间是 撞击时刻 − 3/24 + 3/24，浮点上可能差一点点
      dummy.position.set(cell.dx, cell.dy, (cell.底z + cell.顶z) / 2);
      dummy.updateMatrix();
      mesh.setMatrixAt(count++, dummy.matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }
  return (
    <group>
      {groups.map(({ m: mesh }, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  );
};

// ---------- 核对：6-3-6 每一帧锤底在哪、这一帧里碎了哪几层 ----------
// 层按游戏 y；锤底、顶面是场景 z。汇报和出对照图用（工具里没有直接跑 TS 的地方，在画面里按 --props 打到控制台）
export const breachByFrame = () => {
  const g6 = 段表['6-3-6'].起;
  const cells = fillCells();
  const layerTops = new Map<number, number>();
  for (const cell of cells) layerTops.set(cell.y, Math.max(layerTops.get(cell.y) ?? -Infinity, cell.顶z));
  const rows = [];
  for (let frame = 0; frame <= 段表['6-3-6'].止 - g6; frame++) {
    const physSec = 物理时间(g6 + frame);
    const wPrev = 物理时间(g6 + frame - 1);
    const brokenLayers = [...new Set(cells.filter((c) => c.碎 > wPrev + 1e-9 && c.碎 <= physSec + 1e-9).map((c) => c.y))].sort((a, b) => b - a);
    const remaining = cells.filter((c) => c.碎 > physSec + 1e-9);
    const highestIntact = remaining.length ? Math.max(...remaining.map((c) => c.顶z)) : null;
    rows.push({ f: frame, G: g6 + frame, w: +physSec.toFixed(4), maceBottom: +maceBottomZ(physSec).toFixed(3), 碎层: brokenLayers, highestIntactTop: highestIntact, remainingCells: remaining.length });
  }
  return { FPS, 撞击段内帧, 地面z: choreo.groundZ, 洞顶z: choreo.caveCeilingZ, 层顶: Object.fromEntries(layerTops), rows };
};

// 命令行 --props='{"breachCheck":1}' 时把 `砸穿逐帧` 的结果分段打到控制台（console.warn，模块加载时打：渲染帧标签页的日志 remotion 不转出来），
// 例：npx remotion still 6-3-5至6-举锤砸穿 x.png --frame=0 --props='{"breachCheck":1}' --log=verbose，把「砸穿核对段<7 位偏移>」后面的拼起来就是 JSON
if ((getInputProps() as { breachCheck?: number }).breachCheck) {
  const js = JSON.stringify({ ...breachByFrame(), 撞击: 撞击时刻(), 下坠: choreo.fallStats() });
  for (let k = 0; k < js.length; k += 4000) console.warn('砸穿核对段' + String(k).padStart(7, '0') + js.slice(k, k + 4000));
}
