// 史蒂夫的小木屋门口（三稿「地点」一段，第 8、9、10、13、14、15 句同一个机位）：侧剖面，门在正中，左边门外，右边屋里。
// 第 6 句炸成坑、第 8 句原地盖回来：后墙补过的那片换成白桦木板（比橡木浅一截），边上的旧橡木板留着焦痕（游戏里没有焦痕，演绎）。
// 坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格）：门那一格的中心 x = 0，地面 z = 0；剖面切在 y = 0，朝镜头的南墙和它前面的都去掉。
// 格 (i, j, k) 占 x ∈ [i − 0.5, i + 0.5]、y ∈ [j, j + 1]、z ∈ [k, k + 1]。人走的那排是 j = 0（站在 y = 0.5），箱子、树、告示牌在后一排 j = 1，后墙 j = 2。
// 布局、亮度档都是 Agent 暂定的，用户没看过；机位、天在 场/2-门口/参数.ts。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { sRGB转线性, 方块拼搭, type 方块 } from '@engine/model/方块拼搭.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { Chest, VANILLA_CHEST_TEX } from '@库/物品/箱子.tsx';
import { 告示牌, 告示牌尺寸 } from './告示牌.tsx';
import { 樱花树方块, 樱花树阶段 } from './樱花树.ts';

const 原点: V3 = [-0.5, 0, 0];

/** 屋子：外墙 x 0～6（西墙 i = 0 开门，东墙 i = 6），墙高 3 格（k 0～2），云杉屋顶两层台阶加一排半砖屋脊（k 3～5，顶 z = 5.5），屋里 i 1～5、j 0～1。
 *  屋顶压低是为了让长成的樱花树（7 格）明显高过屋子，天上留得出太阳月亮走的地方 */
export const 小木屋 = { 西墙: 0, 东墙: 6, 后墙: 2, 墙高: 3, 屋顶顶: 5.5, 檐: { 西: -1.5, 东: 7.5, 高: 4 } } as const;

/** 亮度档（sRGB 数值乘）：剖面上的和屋外的照原样，屋里后一排的摆设暗一档，后墙和门后那格再暗一档（侧视里分得出前后，Agent 暂定） */
export const 门口亮度 = { 前: 1, 摆设: 0.85, 后墙: 0.75 } as const;

/** 摆设、站位的坐标（格，场景坐标；站位是脚底，人站在 y = 0.5 那排） */
export const 门口 = {
  地面: 0,
  站排y: 0.5,
  门: { x: 0, 宽: 1, 高: 2, 合页: [-0.5 + 3 / 32, 1 - 3 / 32] as const },
  /** 箱子底面中心，锁扣朝南（朝镜头）：屋里、紧挨着门的右边 */
  箱子: [1, 1.5, 0] as V3,
  /** 树苗的格（树干那一格的底面中心）：门外离墙 3 格（中间空 i −1～−3），头顶没有屋檐 */
  树苗: [-4, 1.5, 0] as V3,
  /** 告示牌底面中心（立着、字朝南） */
  告示牌: [-2, 1.5, 0] as V3,
  站位: {
    门口: 0,
    门外一步: -1,
    牌树之间: -3,
    树外: -5.5,
    箱子右: 2,
    屋里: 3.5,
  },
};

const 树根: [number, number, number] = [门口.树苗[0], 1, 0];

// ---------- 方块 ----------
const 屋方块 = (): 方块[] => {
  const out: 方块[] = [];
  const 放 = (状态: string, i: number, j: number, k: number, 亮?: number) => out.push({ 状态, 位: [i, j, k], 亮 });
  const { 西墙: W, 东墙: E, 后墙: N } = 小木屋;
  // 地面：屋外草方块，屋下西东两边圆石地基、中间橡木地板
  for (let i = -11; i <= 11; i++)
    for (let j = 0; j <= N; j++) {
      if (i < W || i > E) 放('minecraft:grass_block', i, j, -1);
      else 放(i === W || i === E ? 'minecraft:cobblestone' : 'minecraft:oak_planks', i, j, -1);
    }
  // 西墙：剖面那格是门（另画），门上一格木板；门后那格、后墙角
  放('minecraft:oak_planks', W, 0, 2);
  for (let k = 0; k < 3; k++) {
    放('minecraft:oak_planks', W, 1, k, 门口亮度.后墙);
    放('minecraft:oak_log[axis=y]', W, N, k, 门口亮度.后墙);
    放('minecraft:oak_planks', E, 0, k);
    放('minecraft:oak_planks', E, 1, k, 门口亮度.后墙);
    放('minecraft:oak_log[axis=y]', E, N, k, 门口亮度.后墙);
  }
  // 后墙：补过的白桦木板、窗
  for (let i = W + 1; i < E; i++)
    for (let k = 0; k < 3; k++) {
      const 补 = 补墙.some(([a, b]) => a === i && b === k);
      const 窗 = i === 窗位[0] && k === 窗位[1];
      放(窗 ? 'minecraft:glass' : 补 ? 'minecraft:birch_planks' : 'minecraft:oak_planks', i, N, k, 门口亮度.后墙);
    }
  // 屋顶：两层台阶、屋脊一排下半砖，前排（剖面）照原样，后面两排被前排挡住
  for (let j = 0; j <= N; j++) {
    const 亮 = j === 0 ? undefined : 门口亮度.后墙;
    const 层 = (k: number, 西: number, 东: number) => {
      放('minecraft:spruce_stairs[facing=east,half=bottom,shape=straight]', 西, j, k, 亮);
      for (let i = 西 + 1; i < 东; i++) 放('minecraft:spruce_planks', i, j, k, 亮);
      放('minecraft:spruce_stairs[facing=west,half=bottom,shape=straight]', 东, j, k, 亮);
    };
    层(3, W - 1, E + 1);
    层(4, W, E);
    for (let i = W + 2; i <= E - 2; i++) 放('minecraft:spruce_slab[type=bottom]', i, j, 5, 亮);
  }
  // 屋里的摆设（后一排）：工作台、熔炉，后墙上的火把
  放('minecraft:crafting_table', 4, 1, 0, 门口亮度.摆设);
  放('minecraft:furnace[facing=south,lit=false]', 5, 1, 0, 门口亮度.摆设);
  放('minecraft:wall_torch[facing=south]', 3, 1, 1);
  // 屋外：最左边的草丛（第 8 句苦力怕从这里冒出来）
  放('minecraft:tall_grass[half=lower]', -7, 0, 0);
  放('minecraft:tall_grass[half=upper]', -7, 0, 1);
  放('minecraft:grass', -6, 0, 0);
  放('minecraft:grass', -8, 0, 0);
  放('minecraft:grass', 7, 0, 0);
  return out;
};

/** 后墙补过的格 [i, k]：炸开的口子偏左下，补成白桦木板 */
const 补墙: readonly (readonly [number, number])[] = [[1, 1], [1, 2], [2, 0], [2, 1], [2, 2], [3, 2]];
const 窗位 = [4, 1] as const;

const 屋 = 屋方块();
const 门方块: 方块[] = [
  { 状态: 'minecraft:oak_door[facing=east,half=lower,hinge=left,open=false]', 位: [0, 0, 0] },
  { 状态: 'minecraft:oak_door[facing=east,half=upper,hinge=left,open=false]', 位: [0, 0, 1] },
];
// 门按合页转：关着时贴在门洞西边（门外那侧），开着时转到门洞北边、正面朝镜头，人从门前走过不挡
const 门原点: V3 = [-0.5 - 门口.门.合页[0], -门口.门.合页[1], 0];

const 树方块缓存 = new Map<number, 方块[]>();
const 树方块 = (阶段: number) => {
  let b = 树方块缓存.get(阶段);
  if (!b) {
    b = 樱花树方块(阶段, 树根);
    const 屋格 = new Set(屋.map((x) => x.位.join(',')));
    const 撞 = b.find((x) => 屋格.has(x.位.join(',')));
    if (撞) throw new Error(`樱花树第 ${阶段} 阶段的 ${撞.状态} 撞上了屋子的格 ${撞.位.join(',')}`);
    树方块缓存.set(阶段, b);
  }
  return b;
};

// ---------- 焦痕 ----------
// 补墙四周的旧橡木板上，离白桦木板越近越黑；一个贴图像素一个格子，按位置哈希决定涂不涂（不用随机数，各帧一样）
const 焦痕范围 = { i0: 1, i1: 5, k0: 0, k1: 2, 宽: 8 } as const;
const 哈希 = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const 焦痕贴图 = (() => {
  const { i0, i1, k0, k1, 宽 } = 焦痕范围;
  const w = (i1 - i0 + 1) * 16, h = (k1 - k0 + 1) * 16;
  const 是补 = (px: number, py: number) => {
    const i = i0 + Math.floor(px / 16), k = k1 - Math.floor(py / 16);
    return 补墙.some(([a, b]) => a === i && b === k);
  };
  const 是窗 = (px: number, py: number) => i0 + Math.floor(px / 16) === 窗位[0] && k1 - Math.floor(py / 16) === 窗位[1];
  const data = new Uint8Array(w * h * 4);
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      if (是补(px, py) || 是窗(px, py)) continue;
      let d = Infinity;
      for (let qy = Math.max(0, py - 宽); qy <= Math.min(h - 1, py + 宽); qy++)
        for (let qx = Math.max(0, px - 宽); qx <= Math.min(w - 1, px + 宽); qx++) if (是补(qx, qy)) d = Math.min(d, Math.max(Math.abs(qx - px), Math.abs(qy - py)));
      if (d > 宽) continue;
      const 浓 = (1 - (d - 1) / 宽) ** 1.4;
      if (哈希(px, py) > 浓 * 0.9) continue;
      const 深 = 哈希(px + 101, py + 37) < 浓 * 0.6;
      const o = (py * w + px) * 4;
      data.set(深 ? [34, 24, 18, 235] : [62, 44, 30, 190], o);
    }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.flipY = false;
  t.needsUpdate = true;
  return { t, w: w / 16, h: h / 16 };
})();

const 焦痕: React.FC = () => {
  const { i0, k0 } = 焦痕范围;
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: 焦痕贴图.t, transparent: true, depthWrite: false, roughness: 1, metalness: 0 });
    m.color.setScalar(sRGB转线性(门口亮度.后墙));
    return m;
  }, []);
  // 贴在后墙南面前面一点点；贴图第 0 行在上（flipY 关着，v = 0 是第一行），所以 v 朝下
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(焦痕贴图.w, 焦痕贴图.h);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let q = 0; q < uv.count; q++) uv.setY(q, 1 - uv.getY(q));
    return g;
  }, []);
  const cx = i0 - 0.5 + 焦痕贴图.w / 2;
  const cz = k0 + 焦痕贴图.h / 2;
  return <mesh geometry={geom} material={mat} position={[cx, 小木屋.后墙 - 1 / 512, cz]} rotation={[Math.PI / 2, 0, 0]} renderOrder={2} />;
};

// ---------- 组件 ----------
export type 门口小木屋属性 = {
  /** 门开度 0 关 ～ 1 开（游戏里门是一下开合的，中间值是演绎） */
  门开度?: number;
  /** 箱子 openness 0～1（库/物品/箱子.tsx 的 chestState、chestOpenness 算），盖子角度照原版换算 */
  箱子开度?: number;
  /** 樱花树进度 0～1（樱花树阶段：0 树苗、每 1/5 长一截、1 开满花）；不给 = 还没种 */
  树进度?: number;
  /** 插没插告示牌 */
  告示牌?: boolean;
  /** 告示牌上的字：放在字面中心、Z 朝上的 group 里（x 右、z 上，单位格，字面 告示牌尺寸.字面） */
  告示牌字?: React.ReactNode;
  群系?: string;
};

export const 门口小木屋: React.FC<门口小木屋属性> = ({ 门开度 = 0, 箱子开度 = 0, 树进度, 告示牌: 插牌 = false, 告示牌字, 群系 = 'minecraft:plains' }) => {
  const 阶段 = 树进度 === undefined ? null : 樱花树阶段(树进度);
  const 树 = 阶段 === null ? null : 树方块(阶段);
  const [hx, hy] = 门口.门.合页;
  return (
    <group>
      <方块拼搭 方块们={屋} 原点={原点} 群系={群系} 正面花草 />
      <焦痕 />
      <group position={[hx, hy, 0]} rotation={[0, 0, Math.min(1, Math.max(0, 门开度)) * (Math.PI / 2)]}>
        <方块拼搭 方块们={门方块} 原点={门原点} />
      </group>
      <Chest 贴图={VANILLA_CHEST_TEX} 开度={箱子开度} p={门口.箱子} 朝向="south" />
      {树 && <方块拼搭 key={阶段} 方块们={树} 原点={原点} 群系={群系} 正面花草 />}
      {插牌 && <告示牌 位={门口.告示牌}>{告示牌字}</告示牌>}
    </group>
  );
};

export { 告示牌尺寸 };
