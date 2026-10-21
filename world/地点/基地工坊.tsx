// 李樱的基地（第六章第 2 场「基地谋划」）：主世界海上小岛上的一间机械动力风格工坊。
// 片场存档里没有这个基地，没法用 mcai mesh 导出，按场景描述（归档/正篇/06-古城寻卷/2-基地谋划/ 各段 v.md 的 [李樱的基地]）用游戏方块一格一格摆。
// 摆进新世界：主世界-116 基地小岛东南部，房间本地 (0, 0) 在方块 (39740, -1130) 的西北角、地板顶面 y 69（模型/场景/基地小岛.tsx）。
// 镜头里屋外是导入的真实地形，模型自带的屋外草地、沙滩、海面（外景）关掉；外景只给没有地形的核对静帧用（基地预览.tsx）。
// 方块形状和贴图照抄 jar（npm run 取材 -- 基地工坊 → 基地工坊.模型.json/.png，原版 + 机械动力 6.0.8），每种方块一个部件，用 InstancedMesh 按格子摆；
// 材质同 lib/方块模型.tsx（贴图 × 灯光 + 0.4 倍自发光打底）。哪种方块摆哪几格在 基地工坊.布局.ts。
// 窗户例外：玻璃不在这里摆，而是在片场存档里照同一份布局摆出来、让游戏画、mcai mesh 导出（基地窗户.tsx）。这里摆的玻璃每格六面都画，
// 相邻玻璃、玻璃和柱子窗台之间两张面重合，镜头一动就频闪（用户 10-10 反馈）；无缝玻璃的连接纹理也要游戏按四周方块算。依据见 工具/游戏取材/基地窗户.ts 文件头。
//
// 坐标（本地，Z 朝上，1 = 一格，+Y 叫「北」）：地板顶面 z = 0；屋里 x -6～6、y -7～8、高 6 格（天花板底面 z = 6）。
// 屋里（场景描述写的布置、各机位）：东墙（+X）、南墙（-Y）一排大玻璃窗，窗外是草地、沙滩和海；西墙靠墙是机器（安山机壳、工作台、木桶、书架、箱子），
//   墙上离地 3 格一根贯穿南北的传动杆，带三个齿轮转（机械动力「应力转动」的视觉符号）；南窗前一张两格长的云杉木桌（x 1～3、y -3～-2，桌面 z = 1），
//   摆战利品：炽热的血、雪怪首领毛皮。天花板是云杉木板，两根云杉横梁，挂两盏灯笼。屋子正中（0, 0）空着，6-2-4 在这里唤出扫帚。
// 外观（z ≥ 6 的屋顶、墙外一圈，只往屋外长、不碰屋里）：铜瓦双坡屋顶（屋脊沿南北，屋顶从 z 7 起，脊顶 z 15），四面挑檐一格，檐下一圈去皮云杉横梁；
//   山墙是云杉木板加去皮云杉木框，南山墙开小窗；北山墙装风车轴承和四片白帆（慢慢转，带屋里的传动杆；轮毂 (-1, 10, 10)，帆半径 5.5 格）；
//   北墙正中一对云杉门，上有铜瓦雨棚、两盏灯笼；西墙外一根砖砌烟囱（x -9～-8、y -6～-5，顶 z 13）；
//   西墙偏北开 3 格宽、3 格高的敞口门（6-2-4 扫帚从这里飞出去，见 基地工坊.布局.ts）；墙脚外一圈磨制安山岩台阶当勒脚。东墙、南墙外不加东西（窗外的海不能挡）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { BlockModelData } from '../../engine/model/方块模型.tsx';
import { makeTexture } from '../../engine/model/方块场景.tsx';
import { png } from '../../engine/model/贴图.ts';
import { AlphaYetiFur, FieryBlood } from '../物品/战利品.tsx';
import { Chest } from '../物品/箱子.tsx';
import { LAYOUT, WIND, X0, X1, Y0, Y1, range, type Cell } from './基地工坊.布局.ts';
import { BaseWindows } from './基地窗户.tsx';
import data from 'asset:模型/场景/基地工坊';
import atlasPng from 'asset:贴图/场景/基地工坊';

const modelData = data as unknown as BlockModelData;
const ATLAS = png(atlasPng);

export const BASE = {
  inside: { x: [-6, 6], y: [-7, 8] },
  height: 6, // 天花板底面
  table: { x: [1, 3], y: [-3, -2], top: 1 },
  // 桌上的战利品（物品底边中心）
  loot: { 炽热的血: [1.6, -2.5, 1], 雪怪首领毛皮: [2.4, -2.5, 1] } as Record<string, [number, number, number]>,
  sea: -0.12, // 海面（草地顶面 z = 0）
  shaft: { x: -5.5, z: 3.5 }, // 西墙传动杆的轴线
};

// ---------- 一个部件 → 每张贴图一份几何（原点在方块中心） ----------
type Geo = { geo: THREE.BufferGeometry; mat: THREE.Material };
const CENTER = [0.5, -0.5, 0.5];
const geoCache = new Map<string, Geo[]>();
const partGeos = (part: string): Geo[] => {
  const hit = geoCache.get(part);
  if (hit) return hit;
  const partData = modelData.parts[part];
  if (!partData) throw new Error(`基地工坊.模型.json 里没有部件「${part}」`);
  const byTex = new Map<number, { pos: number[]; nor: number[]; uv: number[]; idx: number[] }>();
  for (const quad of partData.quads) {
    if (!byTex.has(quad[0])) byTex.set(quad[0], { pos: [], nor: [], uv: [], idx: [] });
    const bucket = byTex.get(quad[0])!;
    const base = bucket.pos.length / 3;
    for (let k = 0; k < 4; k++) {
      bucket.pos.push(quad[1 + k * 3] - CENTER[0], quad[2 + k * 3] - CENTER[1], quad[3 + k * 3] - CENTER[2]);
      bucket.uv.push(quad[13 + k * 2], quad[14 + k * 2]);
      bucket.nor.push(quad[21], quad[22], quad[23]);
    }
    bucket.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const out = [...byTex.entries()].map(([ti, bucket]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
    geo.setIndex(bucket.idx);
    const t = modelData.textures[ti];
    const map = makeTexture(ATLAS, t);
    const mat = new THREE.MeshStandardMaterial({
      map,
      alphaTest: t.cutout ? 0.5 : 0,
      side: t.cutout ? THREE.DoubleSide : THREE.FrontSide,
      roughness: 0.95,
      emissive: '#ffffff',
      emissiveMap: map,
      emissiveIntensity: 0.4,
    });
    return { geo, mat };
  });
  geoCache.set(part, out);
  return out;
};

const cellMatrix = (c: Cell, spin = 0) =>
  new THREE.Matrix4()
    .makeTranslation(c[0] + 0.5, c[1] + 0.5, c[2] + 0.5)
    .multiply(new THREE.Matrix4().makeRotationZ(((c[3] ?? 0) * Math.PI) / 180))
    .multiply(new THREE.Matrix4().makeRotationX(spin));

// 一种方块摆很多格。spin：绕方块本地 X 轴转的弧度（传动杆、齿轮，模型是 axis=x）
const Blocks: React.FC<{ part: string; cells: Cell[]; spin?: number }> = ({ part, cells, spin = 0 }) => {
  const meshes = useMemo(
    () =>
      partGeos(part).map(({ geo, mat }) => {
        const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
        mesh.frustumCulled = false;
        return mesh;
      }),
    [part, cells],
  );
  for (const mesh of meshes) {
    cells.forEach((c, i) => mesh.setMatrixAt(i, cellMatrix(c, spin)));
    mesh.instanceMatrix.needsUpdate = true;
  }
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
};

// 风车（轮毂位置、转速在 基地工坊.布局.ts 的 WIND）：四片帆各 2 格宽、5 格长
const SAILS: Cell[] = (() => {
  const [hx, hy, hz] = WIND.hub;
  const out: Cell[] = [];
  for (let i = 1; i <= 5; i++) {
    out.push([hx, hy, hz + i], [hx + 1, hy, hz + i]); // 上
    out.push([hx + i, hy, hz], [hx + i, hy, hz - 1]); // 右
    out.push([hx, hy, hz - i], [hx - 1, hy, hz - i]); // 下
    out.push([hx - i, hy, hz], [hx - i, hy, hz + 1]); // 左
  }
  return out;
})();
const WindmillSails: React.FC<{ t: number }> = ({ t }) => {
  const hubCenter: [number, number, number] = [WIND.hub[0] + 0.5, WIND.hub[1] + 0.5, WIND.hub[2] + 0.5];
  const angle = 2 * Math.PI * (WIND.rpm / 60) * t;
  return (
    <group position={hubCenter} rotation={[0, angle, 0]}>
      <group position={[-hubCenter[0], -hubCenter[1], -hubCenter[2]]}>
        <Blocks part="安山机壳" cells={HUB} />
        <Blocks part="白帆" cells={SAILS} />
      </group>
    </group>
  );
};
const HUB: Cell[] = [WIND.hub];

// 外景（没有地形时垫的）：草地一直铺到 13 格，外面一圈沙滩，再外面是海
const OUTSIDE = (() => {
  const cellsByPart: Record<string, Cell[]> = { 草方块: [], 沙子: [] };
  for (const x of range(-16, 16)) for (const y of range(-16, 16)) {
    if (x >= X0 && x <= X1 && y >= Y0 && y <= Y1) continue;
    cellsByPart[Math.max(Math.abs(x + 0.5), Math.abs(y + 0.5)) < 13.5 ? '草方块' : '沙子'].push([x, y, -1]);
  }
  return cellsByPart;
})();
// 西墙上的传动杆（沿南北，绕自己的轴转）：齿轮在 y -5、0、5，其余是杆
const SHAFT_Y = range(-7, 7);
const SHAFT = SHAFT_Y.filter((y) => ![-5, 0, 5].includes(y)).map((y) => [-6, y, 3, 90]);
const COGS = [-5, 0, 5].map((y) => [-6, y, 3, 90]);

// 屋外的海：一整块平面（不受光照，颜色同 场景/传送门海岛.tsx 的远处海面）
const Sea: React.FC = () => {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#5277c4' }), []);
  return (
    <mesh material={mat} position={[0, 0, BASE.sea]}>
      <planeGeometry args={[940, 940]} />
    </mesh>
  );
};

// 立在桌上的物品：贴图正面朝 face 方向（水平方向，本地坐标），物品空间的上方朝 +Z；size：物品多大（格）
const Standing: React.FC<{ at: [number, number, number]; face: number[]; size: number; children: React.ReactNode }> = ({ at, face, size, children }) => (
  <group position={[at[0], at[1], at[2] + size / 2 + 0.01]} rotation={[0, 0, Math.atan2(face[0], -face[1])]}>
    <group rotation={[Math.PI / 2, 0, 0]} scale={size}>
      {children}
    </group>
  </group>
);

// t：时间（秒），传动杆和齿轮按它转；战利品：桌上摆不摆战利品；物品朝向：桌上物品正面朝哪（默认朝北，6-2-4 开头的机位）；
// 外景：画不画屋外垫的草地、沙滩、海面（摆在导入的地形上时关掉）
export const BaseWorkshop: React.FC<{ t: number; loot?: boolean; lootFacing?: number[]; exterior?: boolean }> = ({ t, loot: showLoot = true, lootFacing = [-0.15, 1], exterior = true }) => {
  const spin = 2 * Math.PI * 0.5 * t;
  return (
    <group>
      {Object.entries(LAYOUT).map(([part, cells]) => (part === '玻璃' ? null : <Blocks key={part} part={part} cells={cells} />))}
      <BaseWindows />
      <Blocks part="传动杆" cells={SHAFT} spin={spin} />
      <Blocks part="齿轮" cells={COGS} spin={spin} />
      <WindmillSails t={t} />
      {/* 西墙边的箱子（正面朝屋里）；西墙 y 1～3 开门，所以放在工作台南边 */}
      <Chest p={[-5.5, -3.5, 0]} 朝向="east" />
      {showLoot && (
        <>
          <Standing at={BASE.loot.炽热的血} face={lootFacing} size={0.5}>
            <FieryBlood />
          </Standing>
          <Standing at={BASE.loot.雪怪首领毛皮} face={lootFacing} size={0.5}>
            <AlphaYetiFur />
          </Standing>
        </>
      )}
      {exterior && (
        <>
          {Object.entries(OUTSIDE).map(([part, cells]) => (
            <Blocks key={part} part={part} cells={cells} />
          ))}
          <Sea />
        </>
      )}
    </group>
  );
};
