// 古城4x（放大 4 倍的远古城市）：第 6 章第 4 场、第 7 章的场景（镜头换场景时照这里，老的 古城.tsx 逐步淘汰）。
// 用户 10-13 要求古城改 4x（原来太小发展不开，还要把人拉到城外射箭）：建筑是原版尺寸、原版模板，城的布局铺大到约 4 倍宽（拼图多拼几层、半径放大），不是把方块放大。
// 和老五块一样由取材 mod 的 mesh 动作导出（游戏渲染器实际画的面，含箱子等方块实体），1 = 一格。古城4x-*.网格.* 都不要手改。
// 城底下铺成深暗之域（取材mod 的 FillBiome，用户要有幽匿地形），片场里补了 4 格剧情用的感测体/尖啸体（../../镜头/古城4x布局.ts 的 `storyPatchBlocks`）。无幽匿的第一版网格在 归档/参考模型库/古城4x-无幽匿-1013/。
//
// 取的是新世界 古城放大幽匿-20260930（game/取材服务端/，种子 20260930 同老片场，只多挂数据包 取材mod/数据包/古城放大4倍），/locate 仍是 (-720, ~, 240)，起点、城心件（传送门）、中心大院和老城一样，城心没挪。
//   拼图参数：size 40（原版 7）、max_distance_from_center 440（原版 116）；mod 的 `mcai.BigJigsaw` 放开原版 8 区块上限（四处，见 取材mod/手册.md「古城放大 4 倍」），引用半径 34 区块。
//   结构 1311 件（老城 74 件，其中 56 件原样还在：城心、中心大院、6-4-1 箱子屋 B、6-4-3 石屋 C），范围 x -1162～-294、z -200～676，地面仍是 y -51 层（顶面 y -50）。离线拼城核对见 取材mod/测试/古城测试.sh。
//   新世界多了夸克的世界生成：结构里的箱子被换成 quark:ancient_chest（401 个），城外天然洞里有夸克的萤光蘑菇、刚玉、石灰岩、碧玉。城上面的地表和老片场一样（竖井那列地表在 y 134）。
//
// 分块：游戏 x、z 按 128 格切成 7×7 格，中间那格「中」的中心是城心 (-720, 240)：x 边界 -1168 + 128k、z 边界 -208 + 128k。
//   块名按离「中」几格写：「西2北1」= 往西两格、往北一格。有城的 42 格各导一块，一件都碰不到的 7 格不导，只有西3北1 例外（导出网格.py 的 无件也导：6-4-2、6-4-3a/b/c、6-4-5 往西北看得到它南沿那堵洞壁，没导会露出平的底色）。
//   高度 y -60 到这格「从城地面往上连着的空气」最高处 + 2（至少 4）；大多数块到 y 4，有天然高洞厅的十来块到 y 5～42。各块范围见 工具/游戏取材/古城4x/分块.json。
//   另有两块补洞的（导出网格.py 的 补块）：中顶（中 那格洞顶上的一个高洞）、西4（城的洞在 西3 西边伸出格外的一截），镜头看得到、没导会露底。
//   画哪些块：画布按视锥挑（`tilesInView`，视距 512 格），没画的块不取 .bin。
// 导出命令（要先开游戏：取材mod 下 ./mcai game copyworld name=片场-古城4x幽匿 from=古城放大幽匿-20260930，./mcai game start world=片场-古城4x幽匿）：
//   python3 工具/游戏取材/古城4x/导出网格.py [块名 ...]（参考模型库 下）—— 每块一条
//   ./mcai batch "cam pos=<格心x>,<顶+6>,<格心z> pitch=90 yaw=180 dim=minecraft:overworld" \
//     "mesh from=<x0>,-60,<z0> to=<x1>,<顶>,<z1> origin=-720,-50,240 out=../参考模型库/src/模型/场景/古城4x-<块名>.网格 mark=minecraft:chest,quark:ancient_chest,minecraft:sculk_shrieker,minecraft:sculk_sensor,minecraft:reinforced_deepslate"
//   俯视总览、选址量测的脚本在 工具/游戏取材/古城4x/。
//
// 坐标：原点和老五块一样 = 游戏 (-720, -50, 240)，和 古城.tsx 的 `G`、`toGame` 同一套：场景 (x, y, z) = (游戏 x + 720, 240 - 游戏 z, 游戏 y + 50)，Z 朝上、北 = +Y；方块边界落在整数上，中心 .5。
// 夜视光照同老城（古城.tsx 的 `GuchengLight`）；雾照游戏最大视距，见 `FOG_4X`。
import React from 'react';
import * as THREE from 'three';
import { BlockMesh, BlockMeshInfo, fromGame } from '../../engine/voxel/方块网格.tsx';
import type { V3 } from '../../engine/model/parts.tsx';
import { VIEW_DISTANCE, VIEW_FOG } from '../../engine/voxel/视距.ts';

const meshJsonFiles = import.meta.webpackContext('./', { regExp: /^\.\/古城4x-[^.]+\.网格\.json$/ });
const meshBinFiles = import.meta.webpackContext('./', { regExp: /^\.\/古城4x-[^.]+\.网格\.bin$/ });
const atlasFiles = import.meta.webpackContext('./', { regExp: /^\.\/古城4x-[^.]+\.网格\.png$/ });
const url = (m: string | { default: string }) => (typeof m === 'string' ? m : m.default);

type MeshPart = { 名: string; info: BlockMeshInfo; bin: string; atlas: string; x: [number, number]; z: [number, number]; y: [number, number] };
const BLOCKS: Record<string, MeshPart> = Object.fromEntries(
  meshJsonFiles.keys().map((k) => {
    const partName = k.slice('./古城4x-'.length, -'.网格.json'.length);
    const info = meshJsonFiles(k) as unknown as BlockMeshInfo;
    return [
      partName,
      { 名: partName, info, bin: url(meshBinFiles(`./古城4x-${partName}.网格.bin`)), atlas: url(atlasFiles(`./古城4x-${partName}.网格.png`)),
        x: [info.from[0], info.to[0]], z: [info.from[2], info.to[2]], y: [info.from[1], info.to[1]] },
    ];
  }),
);
export const allParts4x = Object.keys(BLOCKS);
// 各块的游戏范围（两端都含）
export const parts4x = Object.values(BLOCKS).map(({ 名: partName, x, y, z, info }) => ({ name: partName, x, y, z, 面数: info.layers.reduce((s, l) => s + l.quads, 0) }));

const ORIGIN: V3 = [-720, -50, 240];
// 游戏坐标 → 场景坐标（和 古城.tsx 的 G 一样）
export const G4 = (x: number, y: number, z: number): V3 => fromGame([x - ORIGIN[0], y - ORIGIN[1], z - ORIGIN[2]]);
// 场景坐标 → 游戏坐标
export const toGame4 = ([x, y, z]: number[]): V3 => [x + ORIGIN[0], z + ORIGIN[1], ORIGIN[2] - y];

// 游戏 (x, z) 在哪一块（不在任何一块里返回 undefined）；补洞的块（中顶）和 中 平面上重叠，只认含城地面 y -50 的块
export const partAt = (x: number, z: number) => Object.values(BLOCKS).find((b) => x >= b.x[0] && x <= b.x[1] + 1 && z >= b.z[0] && z <= b.z[1] + 1 && b.y[0] <= -50 && b.y[1] >= -50)?.名;
// 游戏 (x, z) 周围 r 格（正方形）碰到的块
export const partsAround = (x: number, z: number, r: number) =>
  Object.values(BLOCKS).filter((b) => b.x[0] <= x + r && b.x[1] + 1 >= x - r && b.z[0] <= z + r && b.z[1] + 1 >= z - r).map((b) => b.名);
// 一段箭路、跑位：从 a 到 b（游戏 [x, z]）两边各 r 格碰到的块
export const partsAlong = (start: number[], end: number[], radius: number) => {
  const steps = Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / 32) + 1;
  const found = new Set<string>();
  for (let i = 0; i <= steps; i++) for (const k of partsAround(start[0] + ((end[0] - start[0]) * i) / steps, start[1] + ((end[1] - start[1]) * i) / steps, radius)) found.add(k);
  return [...found];
};

// 视距、雾：全片通用的满视距（lib/视距.ts）。雾色照 1.20.1 FogRenderer：
// - setupColor 雾色（清屏色同它）：群系雾色 deep_dark 0xC0D8FF × 白天亮度系数（白天 1）；32 区块时不混天色；地下按镜头高度压暗（(y+64)/32 再平方）；
//   夜视再把最大分量拉回 1（项目按夜视画，见 古城.tsx），压暗就被抵掉，结果就是 #C0D8FF。身上有黑暗时不提亮，见 模型/特效/黑暗效果.tsx。
export const VIEW_DISTANCE_4X = VIEW_DISTANCE;
export const FOG_4X = { color: '#c0d8ff', ...VIEW_FOG };

// 各块的包围盒（three.js 坐标：画布里场景组绕 X 转 −90°，场景 (x, y, z) → three (x, z, −y)，即 three = (游戏 x + 720, 游戏 y + 50, 游戏 z − 240)）
const TILE_BOXES = Object.values(BLOCKS).map((b) => ({
  名: b.名,
  box: new THREE.Box3(new THREE.Vector3(b.x[0] - ORIGIN[0], b.y[0] - ORIGIN[1], b.z[0] - ORIGIN[2]), new THREE.Vector3(b.x[1] + 1 - ORIGIN[0], b.y[1] + 1 - ORIGIN[1], b.z[1] + 1 - ORIGIN[2])),
}));
const frustum = new THREE.Frustum();
const viewProj = new THREE.Matrix4();
// 相机视锥（远裁剪面 = 视距）碰到的块
export const tilesInView = (camera: THREE.PerspectiveCamera): string[] => {
  const far = camera.far;
  camera.far = VIEW_DISTANCE_4X;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  camera.far = far;
  camera.updateProjectionMatrix();
  return TILE_BOXES.filter((t) => frustum.intersectsBox(t.box)).map((t) => t.名);
};

// 某种方块在各块里的位置（方块底面中心，场景坐标）
const marks = (ids: string[]): V3[] => Object.values(BLOCKS).flatMap((b) => ids.flatMap((id) => (b.info.markers[id] ?? []).map(fromGame)));

export const GUCHENG4X = {
  // 结构的件（不含地形适配外扩的 12 格，游戏坐标）
  structureBox: { from: [-1162, -52, -200], to: [-294, -22, 676] },
  // 传送门、落点、穹顶：城心和老城同一位置（古城.tsx 的 `GUCHENG`）。新世界城心那列洞顶低一格（y -6），落点净空 44 格
  传送门: { x: 0.5, y: [-11.5, 10.5], z: [15, 23] },
  landingPos: G4(-709.5, -50, 240.5),
  dome: G4(-709.5, -6, 240.5),
  // 箱子：城里的是 quark:ancient_chest；minecraft:chest 是城外地牢、矿井里的。镜头里换成战利品箱（朝向另读，见 镜头/6-4-1/古城画面.tsx 的 `chests4x`）
  箱子: marks(['quark:ancient_chest']),
  outerChests: marks(['minecraft:chest']),
  尖啸体: marks(['minecraft:sculk_shrieker']),
  感测体: marks(['minecraft:sculk_sensor']),
};

// 块：画哪几块（默认只画「中」）；范围：游戏 [x0, z0, x1, z1]，画碰到这个矩形的块（和 块 一起给就取并集）；
// hide / hideBlocks 同 BlockMesh（参考模型坐标的盒子），每块都传
export const Gucheng4x: React.FC<{ parts?: string[]; gameRect?: number[]; hide?: number[][]; hideBlocks?: number[][] }> = ({ parts: parts, gameRect: gameRect, hide, hideBlocks }) => {
  const ks = new Set(parts ?? (gameRect ? [] : ['中']));
  if (gameRect) for (const k of partsAround((gameRect[0] + gameRect[2]) / 2, (gameRect[1] + gameRect[3]) / 2, Math.max(gameRect[2] - gameRect[0], gameRect[3] - gameRect[1]) / 2)) ks.add(k);
  return (
    <group>
      {[...ks].filter((k) => BLOCKS[k]).map((k) => (
        <BlockMesh key={k} info={BLOCKS[k].info} bin={BLOCKS[k].bin} atlas={BLOCKS[k].atlas} hide={hide} hideBlocks={hideBlocks} />
      ))}
    </group>
  );
};
