// 6-3-6 砸穿的特效：方块碎块。全部按物理时间参数算（无模拟状态，任意一帧单独渲染结果一样）。
// 碎块是带贴图的小方块（贴图取 1.20.1 客户端 jar，是崩出它的那一格原来的方块，见 填块.tsx），受重力、绕随机轴翻滚，落地就停。
// 从碎掉的那一格、在碎掉的那一刻崩出来（锤底往下碰到哪层哪层才碎，填块.tsx 的 `breakSecAt`）：
// - 地面炸开：坑里碎开的石板和泥土往上、往外迸，落回街上；
// - 井里：碾碎的那层在滚筒四周崩开，往外、往下飞，比他慢，所以跟拍镜头里碎块从锤头四周往上翻、掠过镜头；碰到井壁就贴着走；
// - 洞顶：最下面那层碎开的深板岩跟着他掉进古城，落在古城地面上；
// 砸到古城地面的震波在 ../6-3-6/震地.tsx（方块真挪走，跟着古城画，竖井.tsx 的 `AncientCity`）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rng, type V3 } from '../../../../engine/model/parts.tsx';
import { pitSurfaceZAt, blockMaterial, blockPngs } from './竖井.tsx';
import { SLAB_Y, fillCells, maceBottomSpeed, type 填格 } from './填块.tsx';

type TexName = keyof typeof blockPngs;
// 轴、壁：井里的碎块碰到井壁就停在井壁上（离井轴 壁 米），水平方向不再往外走，竖直方向照常（贴着井壁往下滑）
type DebrisPiece = { tex: TexName; t0: number; p0: V3; v0: V3; size: number; axis: V3; spin: number; floor: number; life: number; shaftAxis?: [number, number]; wallDist?: number };

const gravity = 9.81;
// 一块碎块在时刻 w 的位置和转动（落到 floor 以后停住）
const state = (piece: DebrisPiece, physSec: number): { p: V3; q: THREE.Quaternion } | null => {
  const t = physSec - piece.t0;
  if (t < 0 || t > piece.life) return null;
  // 落地时刻：p0.z + v0.z t − g t²/2 = floor
  const quadA = -gravity / 2;
  const quadB = piece.v0[2];
  const cc = piece.p0[2] - piece.floor;
  const disc = quadB * quadB - 4 * quadA * cc;
  const tl = disc >= 0 ? (-quadB - Math.sqrt(disc)) / (2 * quadA) : Infinity;
  const tt = Math.min(t, tl > 0 ? tl : t);
  const pos: V3 = [piece.p0[0] + piece.v0[0] * tt, piece.p0[1] + piece.v0[1] * tt, piece.p0[2] + piece.v0[2] * tt - (gravity / 2) * tt * tt];
  if (t > tl && tl > 0) pos[2] = piece.floor;
  if (piece.shaftAxis && piece.wallDist !== undefined) {
    const dx = pos[0] - piece.shaftAxis[0];
    const dy = pos[1] - piece.shaftAxis[1];
    const radial = Math.hypot(dx, dy);
    if (radial > piece.wallDist) {
      pos[0] = piece.shaftAxis[0] + (dx / radial) * piece.wallDist;
      pos[1] = piece.shaftAxis[1] + (dy / radial) * piece.wallDist;
    }
  }
  const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...piece.axis), piece.spin * tt);
  return { p: pos, q: quat };
};

const unit = (rand: () => number): V3 => {
  const z = rand() * 2 - 1;
  const azimuth = rand() * Math.PI * 2;
  const horiz = Math.sqrt(1 - z * z);
  return [horiz * Math.cos(azimuth), horiz * Math.sin(azimuth), z];
};

export type FxParams = {
  impact: number; // 物理时刻
  中心: V3; // 井心（撞击点所在那一格的格心、地面高度，编排.ts 的 井心）
  groundZ: number;
  caveCeilingZ: number;
  ancientCityFloorZ: number;
  breachSec: number; // 打穿洞顶的物理时刻
  landSec: number;
};

// 所有碎块按参数生成一次
const build = (fx: FxParams): DebrisPiece[] => {
  const out: DebrisPiece[] = [];
  const [cx, cy] = fx.中心;
  const cells = fillCells();
  const isShaftColumn = (c: 填格) => pitSurfaceZAt(c.dx, c.dy) === null; // 一直通到古城洞顶的那几列
  const texOf = (c: 填格): TexName => (c.顶z - c.底z < 1 ? c.顶 : c.侧); // 石半砖的侧面贴图是半格高的，碎块用顶面的平滑石头
  // 1. 地面炸开：50 块，从坑里（井口以外、坑面以上）碎掉的格子里挑，在那一格碎掉的那一刻，从格子里往上、往外迸（撞击坑的抛射物），
  //    方向是从井心（锤碰到地面的地方）往这一格的方位
  {
    const rand = rng(631);
    const pool = cells.filter((c) => c.y >= SLAB_Y - 9 && !isShaftColumn(c) && Math.hypot(c.dx, c.dy) <= 7); // 坑口以内（坑口离井心 3.7～7.2 格），不含坑外的裂纹
    for (let k = 0; k < 50; k++) {
      const cell = pool[Math.floor(rand() * pool.length)];
      const px = cx + cell.dx + (rand() - 0.5) * 0.6;
      const py = cy + cell.dy + (rand() - 0.5) * 0.6;
      const azimuth = Math.atan2(py - cy, px - cx) + (rand() - 0.5) * 0.6;
      const out_ = 4 + rand() * 11;
      const up = 7 + rand() * 16;
      const size = 0.25 + rand() * 0.6;
      const z0 = (cell.底z + cell.顶z) / 2;
      // 落点：按落回城的地面的时刻估水平位置，查那里的坑面；落进井口的掉到古城地面。从坑底迸起、够不到城的地面的，按升到最高的时刻估
      const tl = (up + Math.sqrt(Math.max(0, up * up + 2 * gravity * (z0 - fx.groundZ)))) / gravity;
      const landSurfaceZ = pitSurfaceZAt(px + Math.cos(azimuth) * out_ * tl - cx, py + Math.sin(azimuth) * out_ * tl - cy);
      out.push({
        tex: texOf(cell), t0: cell.碎, p0: [px, py, z0], v0: [Math.cos(azimuth) * out_, Math.sin(azimuth) * out_, up], size,
        axis: unit(rand), spin: 6 + rand() * 14, floor: (landSurfaceZ ?? fx.ancientCityFloorZ) + size / 2, life: 30,
      });
    }
  }
  // 2. 井里：锤底碰到一层，这一层碎掉的格子里挑 2 块（离井轴 1.2 米以外：滚筒正下方的被压着往下走，出不来），从这一格上半截崩出来，往外、往下飞。取值：
  //    - 往下：锤底速度的三到七成（滚筒擦边砸到只传一部分动量；超过一成就跑到锤底前面、钻进下面没碎的那层）。
  //    - 往外：2～6 米/秒，几十毫秒内碰到井壁（离井轴 2.1 米起），碰到后贴着井壁走（见 state 的 壁）。
  //    - 重力 9.81，同李樱在古城里自由落体（编排.ts）。
  //    - 翻滚 8～24 弧度/秒：每帧转过一弧度以上在 24 帧/秒下看着是乱跳，所以封顶 24。
  //    - 贴图：这一格原来的方块。
  {
    const rand = rng(632);
    const layers = new Map<number, 填格[]>();
    for (const cell of cells) if ((cell.y < SLAB_Y - 9 || isShaftColumn(cell)) && Math.hypot(cell.dx, cell.dy) >= 1.2) (layers.get(cell.y) ?? layers.set(cell.y, []).get(cell.y)!).push(cell);
    for (const [, list] of [...layers.entries()].sort((x, y) => y[0] - x[0])) {
      for (let k = 0; k < 2; k++) {
        const cell = list[Math.floor(rand() * list.length)];
        if (!Number.isFinite(cell.碎)) continue;
        const px = cx + cell.dx + (rand() - 0.5) * 0.6;
        const py = cy + cell.dy + (rand() - 0.5) * 0.6;
        const ρ = Math.hypot(px - cx, py - cy);
        const ux = (px - cx) / ρ;
        const uy = (py - cy) / ρ;
        const size = 0.15 + rand() * 0.2;
        const vr = 2 + rand() * 4;
        const vz = -maceBottomSpeed(cell.碎) * (0.3 + rand() * 0.4);
        out.push({
          tex: texOf(cell), t0: cell.碎, p0: [px, py, cell.顶z - 0.25], v0: [ux * vr, uy * vr, vz],
          size, axis: unit(rand), spin: 8 + rand() * 16, floor: -1e9, life: 0.35, shaftAxis: [cx, cy], wallDist: Math.max(ρ, 2.12 - size * 0.6),
        });
      }
    }
  }
  // 3. 洞顶：28 块，从洞顶最下面那层（底下就是古城的空洞）碎掉的格子里挑，跟着他掉进古城，落在古城地面上。
  //    下面没有东西挡，被滚筒顶着往下走：往下是锤底速度的八到十二成（四五十到六十几米/秒，和原来一样），往四周 3～9 米/秒散开
  {
    const rand = rng(633);
    const filled = new Set(cells.map((c) => `${c.dx},${c.dy},${c.y}`));
    const pool = cells.filter((c) => c.y <= 0 && !filled.has(`${c.dx},${c.dy},${c.y - 1}`) && Number.isFinite(c.碎));
    for (let k = 0; k < 28 && pool.length; k++) {
      const cell = pool[Math.floor(rand() * pool.length)];
      const px = cx + cell.dx + (rand() - 0.5) * 0.6;
      const py = cy + cell.dy + (rand() - 0.5) * 0.6;
      const azimuth = Math.atan2(py - cy, px - cx) + (rand() - 0.5) * 0.8;
      const vr = 3 + rand() * 6;
      const size = 0.25 + rand() * 0.35;
      out.push({
        tex: texOf(cell), t0: cell.碎, p0: [px, py, (cell.底z + cell.顶z) / 2],
        v0: [Math.cos(azimuth) * vr, Math.sin(azimuth) * vr, -maceBottomSpeed(cell.碎) * (0.8 + rand() * 0.4)], size, axis: unit(rand), spin: 4 + rand() * 10,
        floor: fx.ancientCityFloorZ + size / 2, life: 30,
      });
    }
  }
  return out;
};

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
export const BlockDebris: React.FC<{ P: FxParams; w: number }> = ({ P: fx, w: physSec }) => {
  const all = useMemo(() => build(fx), [fx]);
  const meshes = useMemo(() => {
    const byTex = new Map<TexName, DebrisPiece[]>();
    for (const piece of all) {
      if (!byTex.has(piece.tex)) byTex.set(piece.tex, []);
      byTex.get(piece.tex)!.push(piece);
    }
    return [...byTex.entries()].map(([tex, list]) => {
      const mesh = new THREE.InstancedMesh(boxGeo, blockMaterial(blockPngs[tex]), list.length);
      mesh.frustumCulled = false;
      return { m: mesh, list };
    });
  }, [all]);
  const dummy = new THREE.Object3D();
  for (const { m: mesh, list } of meshes) {
    let count = 0;
    for (const piece of list) {
      const placed = state(piece, physSec);
      if (!placed) continue;
      dummy.position.set(...placed.p);
      dummy.quaternion.copy(placed.q);
      dummy.scale.setScalar(piece.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(count++, dummy.matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }
  return (
    <group>
      {meshes.map(({ m: mesh }, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  );
};
