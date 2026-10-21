// 古城各段（第 6 章第 4 场、第 7 章）共用的画布 `AncientCity4xCanvas`：放大 4 倍的新城网格（模型/场景/古城4x.tsx，夜视光照同 模型/场景/古城.tsx，雾和视距照游戏最大视距）、
// 机位、地上的羊毛、换成战利品箱的箱子；还有带刀鞘和刀的李樱。羊毛、箱子号、哪段开过哪只箱子从 ../古城4x布局.ts 取。
import { ThreeCanvas } from '@remotion/three';
import { canvasDpr } from '../../../../engine/core/渲染级别.ts';
import { useThree } from '@react-three/fiber';
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '../../../../engine/model/parts.tsx';
import { LiYing } from '../../../角色/李樱.tsx';
import type { Mouth } from '../../../角色/口型.ts';
import { type FigurePose, bladeInHand } from '../../../角色/骨架.tsx';
import { DrawnKatana, WornSheath } from '../../../物品/拔刀剑.tsx';
import { Chest, chestState, lootrTex, type 开关, type 箱子朝向 } from '../../../物品/箱子.tsx';
import { WoolBlocks } from '../../../物品/羊毛.tsx';
import { GuchengLight } from '../../古城.tsx';
import { rad } from '../../../../engine/anim/anim.ts';
import { FOG_4X, Gucheng4x, partAt, tilesInView, VIEW_DISTANCE_4X } from '../../古城4x.tsx';
import { SlamGround, slamHideBlocks } from '../../边城/6-3-6/震地.tsx';
import chestTable4x from 'asset:数据/场景/古城4x箱子';
import { allWool, woolBlockAt, woolOrder, openedBefore, checkChestEvent, type BlockPos, type WoolName, type 古城段 } from '../布局.ts';

export type Cam = { pos: V3; tgt: V3; lens: number; roll?: number };

// 场景坐标 (x, y, z) Z 朝上 → three.js (x, z, -y) Y 朝上
const toThree = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);

// 把 three 相机摆到机位：焦距按 36mm 横向画幅换算，three.js 用竖向视角
const aimCamera = (cam: THREE.PerspectiveCamera, camSpec: Cam, aspect: number, far: number) => {
  cam.fov = (2 * Math.atan(18 / camSpec.lens / aspect) * 180) / Math.PI;
  cam.aspect = aspect;
  cam.near = 0.05;
  cam.far = far;
  cam.position.copy(toThree(camSpec.pos));
  cam.up.set(0, 1, 0);
  cam.lookAt(toThree(camSpec.tgt));
  if (camSpec.roll) cam.rotateZ(rad(camSpec.roll));
  cam.updateProjectionMatrix();
};
const Rig: React.FC<{ c: Cam; far?: number }> = ({ c: camSpec, far = 900 }) => {
  const { camera, size, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  aimCamera(camera as THREE.PerspectiveCamera, camSpec, size.width / size.height, far);
  return null;
};

// 箱子方块 [x, y, z]（游戏坐标）在网格里的那一格，用来把网格里画死的箱子藏掉
const chestHideBox = ([x, y, z]: number[]) => [x + 720 + 0.02, 239 - z + 0.02, y + 50 + 0.001, x + 721 - 0.02, 240 - z - 0.02, y + 51 - 0.02];

// 地上的羊毛：placed 是已放下的（底面中心）；刚放下的一块用 pop（0～1）从小长到整块，2 帧过渡。
export const PlacedWool: React.FC<{ blocks: V3[]; popping?: { p: V3; k: number }[] }> = ({ blocks, popping = [] }) => (
  <>
    {blocks.length > 0 && <WoolBlocks blocks={blocks} />}
    {popping.map((b, i) => (
      <group key={i} position={[b.p[0], b.p[1], b.p[2] + 0.5]} scale={Math.max(0.01, b.k)}>
        <WoolBlocks blocks={[[0, 0, -0.5]]} />
      </group>
    ))}
  </>
);

// 李樱：左腰挂刀鞘（刀在鞘里时露刀柄）；bladeOn 时右手握出鞘的刀，刀的方向按 骨架.tsx 的 bladeInHand（身体坐标里的角度）
// handR：刀没出鞘时右手里拿的别的东西（6-4-1 开头还握着 6-3-6 的重锤）；嘴：说话的口型（src/lib/口型.ts）
export const LiYingWithBlade: React.FC<{ pose: FigurePose; bladeOn?: boolean; blade?: number; bladeSide?: number; handR?: React.ReactNode; 嘴?: Mouth }> = ({ pose, bladeOn = false, blade = 0, bladeSide = 0, handR, 嘴: mouth }) => (
  <LiYing
    pose={pose}
    嘴={mouth}
    hipL={<WornSheath sheathed={!bladeOn} />}
    handR={
      bladeOn ? (
        <group quaternion={bladeInHand(pose, blade, bladeSide)}>
          <DrawnKatana />
        </group>
      ) : (
        handR
      )
    }
  />
);

// ======================= 古城4x 画布（放大 4 倍的新城） =======================
// 城里的箱子：401 只 quark:ancient_chest（夸克换掉了结构里的原版箱子），镜头里一律画成 Lootr 战利品箱（用户 10-02：小说第 1 章点名 Lootr）：
//   网格里那只用 hide 藏掉，原位放 模型/物品/箱子.tsx 的共用箱子（开盖、已开贴图都在那里）。
// 朝向（facing = 锁扣那面朝哪）从片场存档 片场-古城4x 的 region 文件离线读方块属性：工具/游戏取材/古城4x/读箱子朝向.py → 模型/场景/古城4x箱子.json
//   （全是单箱；号 = 工具/游戏取材/古城4x/out/量测.json 的编号，即 00-说明.md、古城4x布局.ts 里的 #210 等）。
export type AncientCity4xChest = { 号: number; block: V3; facing: 箱子朝向; 块: string };
export const chests4x: AncientCity4xChest[] = (chestTable4x as unknown as { 号: number; block: number[]; facing: string }[]).map((c) => ({
  号: c.号,
  block: c.block as V3,
  facing: c.facing as 箱子朝向,
  块: partAt(c.block[0], c.block[2]) ?? '',
}));
const CHEST_HIDE_4X = chests4x.map((c) => chestHideBox(c.block));
// 这一段里开关的那只箱子：箱子号 + 几秒开、几秒关、这一帧几秒（按这一段自己的钟）
export type ChestOpening = { 号: number } & 开关;
// 挑块用的相机（不是画布里那台）
const pickCamera = new THREE.PerspectiveCamera();
const viewCamera = (cam: Cam, aspect: number) => {
  aimCamera(pickCamera, cam, aspect, VIEW_DISTANCE_4X);
  return pickCamera;
};

// 羊毛：名字（古城4x布局.ts 的 全部羊毛，如 'P1'、'F1'、'C'）或羊毛条目 [方块 x, 站立面 y, 方块 z]（同布局文件的写法）
export type 羊毛4x = WoolName | BlockPos;
const woolCell = (w: 羊毛4x): BlockPos => (typeof w === 'string' ? allWool[w] : w);
// 按 羊毛顺序 垫到第几块为止（含）：已垫羊毛('B') = 6-4-1 一路垫下来的 P1～B
export const placedWoolThrough = (last: WoolName): WoolName[] => woolOrder.slice(0, woolOrder.indexOf(last) + 1);

// 视距、雾照游戏最大视距（模型/场景/古城4x.tsx 的 `FOG_4X`），网格块按视锥挑（`tilesInView`），各段不另给（用户 10-19 定：远处不露底，新段默认就是满视距）。
// 黑暗之类要改雾的，在画布里放 模型/特效/黑暗效果.tsx 的 `DarknessEffect`（平时的雾传 `FOG_4X`）。
// 羊毛：已经放下的；长羊毛：正在放的那几块（k 0～1，同 羊毛们 的 popping）。
// 段：剧情走到哪一段（../古城4x布局/箱子.ts 的 古城段序），这一段以前开过的箱子画已开贴图。
// 开箱：这一段里开关的那只箱子，号 + 几秒开、几秒关、这一帧几秒（模型/物品/箱子.tsx 的 开关），开度和已开贴图都按它算。
// hide / hideBlocks：镜头自己要藏的（参考模型坐标的盒子，同 BlockMesh），城里全部箱子的藏匿盒已经自动加在前面。
export const AncientCity4xCanvas: React.FC<{
  cam: Cam;
  width: number;
  height: number;
  段: 古城段;
  羊毛?: 羊毛4x[];
  growingWool?: { w: 羊毛4x; k: number }[];
  开箱?: ChestOpening;
  hide?: number[][];
  hideBlocks?: number[][];
  children?: React.ReactNode;
}> = ({ cam, width, height, 段: segment, 羊毛: wool = [], growingWool = [], 开箱: chestOpening, hide, hideBlocks, children }) => {
  // 每帧按视锥重挑；块名没变就用同一个数组（Gucheng4x 不重挂网格）
  const inView = tilesInView(viewCamera(cam, width / height)).join();
  const drawParts = useMemo(() => inView.split(','), [inView]);
  const drawnSet = useMemo(() => new Set(drawParts), [drawParts]);
  const hideBoxes = useMemo(() => (hide?.length ? [...CHEST_HIDE_4X, ...hide] : CHEST_HIDE_4X), [hide]);
  // 6-3-6 砸地震飞的方块是真挪走的（../6-3-6/震地.tsx）：画到「中」块就藏掉原位、画落定后的坑、落块和裂纹
  const slamShown = drawnSet.has('中');
  const hideBlockBoxes = useMemo(() => (slamShown ? [...slamHideBlocks, ...(hideBlocks ?? [])] : hideBlocks), [slamShown, hideBlocks]);
  if (chestOpening) checkChestEvent(segment, chestOpening.号);
  const openedIds = openedBefore(segment);
  const own = chestOpening && { 号: chestOpening.号, ...chestState(chestOpening) };
  const woolPositions4x = wool.map((w) => woolBlockAt(woolCell(w)));
  return (
    <ThreeCanvas width={width} height={height} gl={{ antialias: true }} dpr={canvasDpr(1)}>
      <color attach="background" args={[FOG_4X.color]} />
      <fog attach="fog" args={[FOG_4X.color, FOG_4X.near, FOG_4X.far]} />
      <Rig c={cam} far={VIEW_DISTANCE_4X} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <GuchengLight />
        <Gucheng4x parts={drawParts} hide={hideBoxes} hideBlocks={hideBlockBoxes} />
        {slamShown && <SlamGround />}
        {chests4x
          .filter((c) => drawnSet.has(c.块))
          .map((c) => {
            const mine = own?.号 === c.号 ? own : undefined;
            return (
              <Chest
                key={c.号}
                p={[c.block[0] + 720.5, 239.5 - c.block[2], c.block[1] + 50]}
                朝向={c.facing}
                开度={mine?.开度 ?? 0}
                贴图={lootrTex(openedIds.includes(c.号) || !!mine?.开过)}
                自发光={0.4}
              />
            );
          })}
        <PlacedWool blocks={woolPositions4x} popping={growingWool.map(({ w: woolId, k }) => ({ p: woolBlockAt(woolCell(woolId)), k }))} />
        {children}
      </group>
    </ThreeCanvas>
  );
};
