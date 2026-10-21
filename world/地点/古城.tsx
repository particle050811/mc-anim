// 古城（远古城市 minecraft:ancient_city）：第 4 场的场景，6-3-6 冲破的「穹顶」也在这里。用取材 mod 的 mesh 动作从片场存档导出（含箱子等方块实体），实际比例（1 = 一格）。古城*.网格.* 不要手改。
// 取的是片场存档主世界里离原点最近的一座（/locate → (-720, ~, 240)，起点区块 (-45, 15)），结构范围 x -826～-609、y -52～-22、z 131～334。片场存档里没有边城（参考模型库自搭 边城轮廓.tsx），所以「古城在边城脚下」只在剧情上成立；正上方是一片山（地面约 y 100～120）。
// 分五块导出，一块一个网格，镜头按需挑着画（没画的那块不取 .bin）：
//   中心：x -760～-660、z 186～290 —— 城中央「传送门」（强化深板岩框）、内院、北边东边带箱子的小屋；第 4 场的戏都在这里
//   西：  x -832～-761、z 124～342 —— 西边城门大道、营房
//   东：  x -659～-600、z 124～342 —— 东边大道、小屋、熔岩池
//   北：  x -760～-660、z 124～185；南：x -760～-660、z 291～342
//   高度都是 y -56～4（城地面在 y -51/-50，中心上空大洞顶在 y -5～0）。
// 洞：往西挖了一条洞（6-4-3 黄叛挪到 300 米外，用户 10-12 要远几百米；古城布局不能动，所以在片场存档里从洞厅西壁顺射箭线往西挖）：
//   80 米深板岩接一个原有的大溶洞（滴水石洞，带地下水），溶洞 90 米，再挖 50 米石头，尽头一个洞室，黄叛站洞室前沿岩坎上（离李樱 305 米）。挖法见 镜头/6-4-3/几何.ts 的 黄叛脚底。
//   挖之前的存档备份在 game/存档备份/片场-20261012-古城挖洞前。新导两块（旧五块不重导）：
//   洞口：x -832～-746、y -30～3、z 207～226 —— 洞厅西壁洞口和前 80 米通道；把中心、西两块里这个盒子里的方块换掉（`hideBlocks`）
//   西洞：x -1000～-833、y -40～70、z 150～280 —— 溶洞、后段通道、洞室，在旧五块范围外
//     ./mcai batch "cam pos=-790,10,216 pitch=90 yaw=180 dim=minecraft:overworld" \
//       "mesh from=-832,-30,207 to=-746,3,226 origin=-720,-50,240 out=../参考模型库/src/模型/场景/古城洞口.网格 mark=…同上" \
//       "cam pos=-916,60,215 pitch=90 yaw=180" "mesh from=-1000,-40,150 to=-833,70,280 origin=-720,-50,240 out=../参考模型库/src/模型/场景/古城西洞.网格 mark=…"
// 导出命令（取材mod 目录下，主世界；五块共用一个原点，拼起来严丝合缝）：
//   ./mcai batch "cam pos=-710,10,238 pitch=90 yaw=180 dim=minecraft:overworld" \
//     "mesh from=-760,-56,186 to=-660,4,290 origin=-720,-50,240 out=../参考模型库/src/模型/场景/古城.网格 mark=minecraft:chest,minecraft:sculk_shrieker,minecraft:sculk_sensor,minecraft:reinforced_deepslate" \
//     "cam pos=-796,10,233 pitch=90 yaw=180" "mesh from=-832,-56,124 to=-761,4,342 origin=-720,-50,240 out=../参考模型库/src/模型/场景/古城西.网格 mark=…同上" \
//     "cam pos=-630,10,233 pitch=90 yaw=180" "mesh from=-659,-56,124 to=-600,4,342 origin=-720,-50,240 out=../参考模型库/src/模型/场景/古城东.网格 mark=…" \
//     "cam pos=-710,10,155 pitch=90 yaw=180" "mesh from=-760,-56,124 to=-660,4,185 origin=-720,-50,240 out=../参考模型库/src/模型/场景/古城北.网格 mark=…" \
//     "cam pos=-710,10,316 pitch=90 yaw=180" "mesh from=-760,-56,291 to=-660,4,342 origin=-720,-50,240 out=../参考模型库/src/模型/场景/古城南.网格 mark=…"
//   （npm run 取材 -- 古城，要先开游戏：./mcai game start world=片场）
//
// 坐标：原点 = 游戏 (-720, -50, 240)（传送门框所在南北线、城主地面 y -51 那层的顶面）。场景 (x, y, z) = (游戏 x + 720, 240 - 游戏 z, 游戏 y + 50)，Z 朝上、北 = +Y；方块边界在整数上。`cityFromGame(x, y, z)` 把游戏坐标（可带小数）换成场景坐标。
//
// 用到的地方（第 4 场 6-4-1、6-4-3、6-4-8 共用；第 3 场 6-3-6 冲破穹顶、落地也用）：
//   `GUCHENG.落点`：李樱砸穿穹顶后落地处 = 第 3 场竖井那一列（游戏 (-710, 240)，见 镜头/6-3-下坠/编排.ts 的 `ancientCity.竖井列`），内院东侧通道里正对往东「回廊」的门洞，地面 z 0；正上方 45 格是洞顶，中间全空。
//   `GUCHENG.dome`：落点正上方洞顶底面（洞顶最下一层 y -5 的底面，场景 z 45）；6-3-6 从这破顶落进来，往上是实心岩，约 100 格到地表。
//   第 3 场换用这个模型时：<Gucheng 块={…} /> 外套一层 group，position = 竖井中心场景坐标 − `GUCHENG.落点`（xy），z 对齐 `ancientCityFloorZ`；然后 镜头/6-3-下坠/ 里的 `古城局部.网格.*` 占位可删。
// 夜视（用户 10-02 嫌古城太黑）：一律按夜视药水画——光照亮度拉满、颜色照常。灯光见 `GuchengLight`：和地标场景同一套日光 + 天光 + 环境光但不投影（地下有洞顶，投影会整座城在阴影里），面朝向明暗和烘进去的环境光遮蔽照旧；幽匿块发光点、灵魂灯保留贴图本色。
import React from 'react';
import { BlockMesh, BlockMeshInfo, fromGame } from '../../engine/voxel/方块网格.tsx';
import type { V3 } from '../../engine/model/parts.tsx';
import rawC from 'asset:网格/古城/头';
import binC from 'asset:网格/古城/顶点';
import atlasC from 'asset:网格/古城/图集';
import rawW from 'asset:网格/古城西/头';
import binW from 'asset:网格/古城西/顶点';
import atlasW from 'asset:网格/古城西/图集';
import rawE from 'asset:网格/古城东/头';
import binE from 'asset:网格/古城东/顶点';
import atlasE from 'asset:网格/古城东/图集';
import rawN from 'asset:网格/古城北/头';
import binN from 'asset:网格/古城北/顶点';
import atlasN from 'asset:网格/古城北/图集';
import rawS from 'asset:网格/古城南/头';
import binS from 'asset:网格/古城南/顶点';
import atlasS from 'asset:网格/古城南/图集';
import rawK from 'asset:网格/古城洞口/头';
import binK from 'asset:网格/古城洞口/顶点';
import atlasK from 'asset:网格/古城洞口/图集';
import rawX from 'asset:网格/古城西洞/头';
import binX from 'asset:网格/古城西洞/顶点';
import atlasX from 'asset:网格/古城西洞/图集';

// 洞口：画中心或西的时候自动一起画（这两块里洞口盒子那一片换成它），不用写进 块
export type AncientCityPart = '中心' | '西' | '东' | '北' | '南' | '西洞';
type MeshPart = AncientCityPart | '洞口';
const BLOCKS: Record<MeshPart, { info: BlockMeshInfo; bin: string; atlas: string }> = {
  中心: { info: rawC as unknown as BlockMeshInfo, bin: binC, atlas: atlasC },
  西: { info: rawW as unknown as BlockMeshInfo, bin: binW, atlas: atlasW },
  东: { info: rawE as unknown as BlockMeshInfo, bin: binE, atlas: atlasE },
  北: { info: rawN as unknown as BlockMeshInfo, bin: binN, atlas: atlasN },
  南: { info: rawS as unknown as BlockMeshInfo, bin: binS, atlas: atlasS },
  洞口: { info: rawK as unknown as BlockMeshInfo, bin: binK, atlas: atlasK },
  西洞: { info: rawX as unknown as BlockMeshInfo, bin: binX, atlas: atlasX },
};
export const allParts: AncientCityPart[] = ['中心', '西', '东', '北', '南', '西洞'];
// 原来五块（标记点只从这五块收：西洞里那几个天然的感测体、尖啸体不算城里的）
const cityParts: AncientCityPart[] = ['中心', '西', '东', '北', '南'];

const ORIGIN = BLOCKS.中心.info.origin; // 游戏 (-720, -50, 240)
// 游戏坐标 → 场景坐标
export const cityFromGame = (x: number, y: number, z: number): V3 => fromGame([x - ORIGIN[0], y - ORIGIN[1], z - ORIGIN[2]]);
const caveMouthBox = (() => {
  const { from, to } = BLOCKS.洞口.info;
  const cornerA = cityFromGame(from[0], from[1], to[2] + 1);
  const cornerB = cityFromGame(to[0] + 1, to[1] + 1, from[2]);
  return [Math.min(cornerA[0], cornerB[0]), Math.min(cornerA[1], cornerB[1]), Math.min(cornerA[2], cornerB[2]), Math.max(cornerA[0], cornerB[0]), Math.max(cornerA[1], cornerB[1]), Math.max(cornerA[2], cornerB[2])];
})();
const caveMouthHide = [caveMouthBox];
// 场景坐标 → 游戏坐标
export const toGame = ([x, y, z]: number[]): V3 => [x + ORIGIN[0], z + ORIGIN[1], ORIGIN[2] - y];
// 某种方块在各块里的位置（方块底面中心，场景坐标）
const marks = (id: string): V3[] => cityParts.flatMap((k) => (BLOCKS[k].info.markers[id] ?? []).map(fromGame));

export const GUCHENG = {
  // 结构范围（游戏坐标）
  structureBox: { from: [-826, -52, 131], to: [-609, -22, 334] },
  // 传送门：强化深板岩框，竖在 x = 0.5 那一格的南北向平面上，框外沿 y -11.5～10.5、z 15～23（游戏 x -720、z 230～251、y -35～-28）
  传送门: { x: 0.5, y: [-11.5, 10.5], z: [15, 23] },
  landingPos: cityFromGame(-709.5, -50, 240.5), // (10.5, -0.5, 0)
  dome: cityFromGame(-709.5, -5, 240.5), // (10.5, -0.5, 45)：洞顶的底面
  箱子: marks('minecraft:chest'),
  尖啸体: marks('minecraft:sculk_shrieker'),
  感测体: marks('minecraft:sculk_sensor'),
};

// 夜视下的灯：日光从东南高处来（和地标场景同一套强度），不投影；地下没有天，天光的地面色压低一点让顶面和底面分得开
export const GUCHENG_SUN: V3 = [0.45, -0.55, 0.7];
export const GuchengLight: React.FC<{ brightness?: number }> = ({ brightness = 1 }) => (
  <>
    <directionalLight position={GUCHENG_SUN} intensity={3.2 * brightness} color="#fffaf0" />
    <hemisphereLight args={['#e8f0ff', '#5a5f66', 1.3 * brightness]} position={[0, 0, 1]} />
    <ambientLight intensity={0.7 * brightness} />
  </>
);
// 夜视下远处的颜色：游戏里夜视把雾色拉到最亮；这里取偏冷的深灰，远处的洞壁淡进去，又不是一片死黑
export const GUCHENG_FOG = '#2a3238';

// 块：画哪几块（默认只画中心）；hide：这些盒子 [x0, y0, z0, x1, y1, z1] 里的面不画（箱子换成战利品箱、感测体换成会抖的等）
// 中心、西两块里洞口盒子那一片按方块藏（`hideBlocks`），画洞口那块顶上（片场存档挖了洞，见文件头）
export const Gucheng: React.FC<{ parts?: AncientCityPart[]; hide?: number[][] }> = ({ parts: parts = ['中心'], hide }) => {
  const ks: MeshPart[] = parts.includes('中心') || parts.includes('西') ? [...parts, '洞口'] : parts;
  return (
    <group>
      {ks.map((k) => (
        <BlockMesh key={k} info={BLOCKS[k].info} bin={BLOCKS[k].bin} atlas={BLOCKS[k].atlas} hide={hide} hideBlocks={k === '中心' || k === '西' ? caveMouthHide : undefined} />
      ))}
    </group>
  );
};
// 中心那块的图集（碎块特效用同一张贴图）
export const Gucheng_ATLAS = atlasC;
// 东那块的图集（6-4-3 弹回去的箭击穿的柱廊南段顶板、黄叛头顶的岩檐都在东块）
export const Gucheng_ATLAS_EAST = atlasE;
