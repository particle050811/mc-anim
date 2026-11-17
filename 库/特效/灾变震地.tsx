// 灾变震地：灾变模组（L_Ender's Cataclysm 3.31，1.20.1 Forge）里炎魔 Ignis 一锤砸地时的特效，照游戏原样搬。
// 用户 10-12 嫌 6-3-6 砸进古城的烟怪，要参考灾变炎魔那种「正方块」特效：砸地时从地面一圈圈往外蹦起来的整块方块（`Cm_Falling_Block_Entity`），不是烟也不是贴图粒子。
// 出处（jar 在 game/缓存/cataclysm/，Vineflower 反编译）：
// - `Ignis_Entity` 的 REINFORCED_SMASH（盾没碎时 vecx 3.0）：第 3 刻 `ShieldSmashparticle`（方块粒子 + 圆环），第 5 刻起每 2 刻调一次 `ShieldSmashDamage`，距离 3、4……10 格，一圈圈往外传。
// - `ShieldSmashDamage`(spreadarc 2.0, distance d)：以砸点为心、半径 d 的整圆上均匀取 ceil(d × 2π) 个点，每点脚下的方块（脚底那层往下第一块有模型的）
//   生成一个 `Cm_Falling_Block_Entity` 拷贝（原地方块不动），放在脚底层上面一格，竖直初速度 0.2 + 高斯 × 0.15 格/刻。
// - `Cm_Falling_Block_Entity.tick`：每刻先 vy −0.04，再移动（碰到方块停住），再 ×0.98；落地后活过 10 刻就消失。碰撞箱 0.98 × 0.98（生成时抬 0.01）；
//   用方块自己的模型整块画（一整格、受环境光照）。
// - `ShieldSmashparticle`：80 + random(12) 个方块粒子（`TerrainParticle`），半径 1.3 的圆上（第 i 个转 i 弧度）、离地 0.3，速度 高斯 × 0.07 再经 `Particle` 构造函数随机化（粒子面片.tsx 的 `particleInitVel`）；
//   再加一个 `RingParticle`（25 刻，白，大小 25，变大）：平躺在离地 0.3 的白色圆环，贴图 ring_0～5（按年龄换帧），半边长 = 2.5 × 年龄 / 25，
//   不透明度 0.95 × (1 − 年龄 / 25) + 0.05，满亮度。`RingParticle.tick` 年龄每刻长 2，第 13 刻就没了（0.65 秒）。
// 不画（不是画面特效）：`AreaAttack`、屏幕震动、声音（声音另有声音.tsx）。
// 和游戏不同（简化）：只在「脚底那一层上面是空的」格子上蹦（街面、坑），上面有墙、台阶的格子不画；方块粒子不处理撞墙，只按地面停住。
// `boost`（不给就是游戏原样）：多几圈、环带加密、往外飞、真挪（方块真的离开原位、落到哪格留在哪格）、裂纹、圆环和方块粒子放大，见 `QuakeBoost`。
// 时间：秒 = 砸地以后的物理秒数（20 刻/秒，原速）。坐标：数据（工具/游戏取材/网格碎块.py 从场景网格取的格子）的场景坐标，Z 朝上。
// 许可：Cataclysm 是 CC BY-NC-ND 4.0，这里只拷了圆环的 6 张贴图（`灾变圆环.贴图`，npm run 取材 -- 灾变圆环），开源时要排除或署名。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '../../engine/core/坐标.ts';
import { pngDir, type Png } from '../../engine/model/贴图.ts';
import { debrisMat, toGeo, atlasTex } from './方块飞溅.tsx';
import { DIRS, face, fullFaces, newBuf, tintsOf, type DebrisData } from './方块碎块面.ts';
import { BreakParticleQuads } from './方块破坏粒子.tsx';
import { cracksAt, eventsDoneAt, gameQuake, holeFaces, hopBlocksAt, moverPose, planQuake, quakeParticlesAt, ringAt, type QuakeBoost, type QuakeCell } from './灾变震地计划.ts';
import { assetDir } from '../../engine/core/资产目录.ts';
import ring0Png from 'asset:贴图/特效/灾变圆环/ring_0';
import ring1Png from 'asset:贴图/特效/灾变圆环/ring_1';
import ring2Png from 'asset:贴图/特效/灾变圆环/ring_2';
import ring3Png from 'asset:贴图/特效/灾变圆环/ring_3';
import ring4Png from 'asset:贴图/特效/灾变圆环/ring_4';
import ring5Png from 'asset:贴图/特效/灾变圆环/ring_5';
import { ticksPerSec } from '../原版物理.ts';

// 计划（哪些格子蹦、怎么飞）和逐帧取样在纯模块 灾变震地计划.ts；这里建几何、材质，把每帧算好的位置画出来。老代码照旧从这里引这些名字
export { quakeHideBlocks, type QuakeBoost } from './灾变震地计划.ts';

const ringFrames = Object.entries(pngDir(assetDir({ './ring_0.png': ring0Png, './ring_1.png': ring1Png, './ring_2.png': ring2Png, './ring_3.png': ring3Png, './ring_4.png': ring4Png, './ring_5.png': ring5Png })))
  .sort((a, b) => Number(a[0].replace(/\D/g, '')) - Number(b[0].replace(/\D/g, '')))
  .map(([, png]) => png);
const ringTexCache = new Map<Png, THREE.DataTexture>();
const pixelTexture = (png: Png) => {
  let t = ringTexCache.get(png);
  if (!t) {
    t = new THREE.DataTexture(png.px, png.w, png.h, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.flipY = false;
    t.needsUpdate = true;
    ringTexCache.set(png, t);
  }
  return t;
};
const ringGeometry = new THREE.PlaneGeometry(2, 2);
// 每帧贴图 × 不透明度（按 1/100 取整）一份材质，渲染时不每帧新建
const ringMatCache = new Map<string, THREE.MeshBasicMaterial>();
const ringMaterial = (frame: Png, opacity: number) => {
  const roundedOpacity = Math.round(opacity * 100) / 100;
  const key = `${ringFrames.indexOf(frame)}|${roundedOpacity}`;
  let mat = ringMatCache.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color: '#ffffff', map: pixelTexture(frame), opacity: roundedOpacity, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    ringMatCache.set(key, mat);
  }
  return mat;
};

// 裂纹：原版 crumbling 的混合（DST_COLOR, SRC_COLOR）= 2 × 裂纹 × 底色，透明处丢掉；一张平铺在方块顶面上方一点的面
// （画面开了对数深度，polygonOffset 不起作用）
const crackMatCache = new Map<Png, THREE.MeshBasicMaterial>();
const crackMaterial = (png: Png) => {
  let mat = crackMatCache.get(png);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      map: pixelTexture(png), alphaTest: 0.1, transparent: true, depthWrite: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
    });
    crackMatCache.set(png, mat);
  }
  return mat;
};
const crackPlane = new THREE.PlaneGeometry(1, 1);

// `data`：网格碎块.py 取的地面那几层格子（不要外圈 `ring`）；`atlas`：同一个场景网格的图集；`中心`：砸点（场景坐标，z = 地面的顶面）；
// `秒`：砸地以后的物理秒数（< 0：游戏原样不画；真挪时蹦的方块画在原位，场景网格里这几格要用 `quakeHideBlocks` 藏掉）；`boost`：见 `QuakeBoost`，不给照游戏；
// `cracks`：destroy_stage_0～9 十张贴图（`boost.裂纹` > 0 时要给）
export const CataclysmQuake: React.FC<{ data: DebrisData; atlas: Png; center: V3; sec: number; seed?: number; boost?: QuakeBoost; cracks?: Png[] }> = ({
  data, atlas, center, sec, seed = 8631, boost = gameQuake, cracks,
}) => {
  const plan = planQuake(data, center, seed, boost);
  const displaced = plan.displaced;
  const tex = atlasTex(atlas);
  const mat = debrisMat(tex);
  const geometries = useMemo(() => {
    const tint = tintsOf(data);
    const cache = new Map<QuakeCell, THREE.BufferGeometry>();
    for (const cell of [...plan.hops.map((b) => b.cell), ...(displaced?.movers.map((m) => m.cell) ?? [])]) {
      if (cache.has(cell)) continue;
      const ff = fullFaces(cell.faces, tint);
      const buf = newBuf();
      for (const dir of Object.keys(DIRS)) face(buf, [0, 0, 0], 0.5, dir, ff[dir], true);
      cache.set(cell, toGeo(buf));
    }
    return cache;
  }, [plan, data]); // eslint-disable-line react-hooks/exhaustive-deps
  // 坑的几何按「到这一刻为止发生了几件事」缓存
  const holeCache = useMemo(() => new Map<number, THREE.BufferGeometry>(), [plan]);
  const crackMeshes = useMemo(() => {
    if (!displaced?.cracks.length || !cracks) return [];
    return cracks.map((png, stage) => {
      const mesh = new THREE.InstancedMesh(crackPlane, crackMaterial(png), Math.max(1, displaced.cracks.filter((c) => c.stage === stage).length));
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      return mesh;
    });
  }, [displaced, cracks]);
  const ticks = sec * ticksPerSec;
  const nodes: React.ReactNode[] = [];
  if (displaced) {
    displaced.movers.forEach((m, i) => {
      const { base, angle } = moverPose(m, ticks);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...m.axis), angle);
      nodes.push(<mesh key={i} geometry={geometries.get(m.cell)} material={mat} position={[base[0], base[1], base[2] + 0.5]} quaternion={q} />);
    });
    if (sec >= 0) {
      const done = eventsDoneAt(displaced, ticks);
      let hole = holeCache.get(done);
      if (!hole) holeCache.set(done, (hole = toGeo(holeFaces(displaced, data, ticks))));
      nodes.push(<mesh key="坑" geometry={hole} material={mat} />);
    }
    const dummy = new THREE.Object3D();
    for (const [stage, mesh] of crackMeshes.entries()) {
      let count = 0;
      if (sec >= 0)
        for (const p of cracksAt(displaced, ticks, stage)) {
          dummy.position.set(p[0], p[1], p[2] + 0.503);
          dummy.updateMatrix();
          mesh.setMatrixAt(count++, dummy.matrix);
        }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      nodes.push(<primitive key={`裂纹${stage}`} object={mesh} />);
    }
  }
  if (sec < 0) return nodes.length ? <group>{nodes}</group> : null;
  for (const hop of hopBlocksAt(plan, ticks)) nodes.push(<mesh key={hop.index} geometry={geometries.get(hop.cell)} material={mat} position={[hop.base[0], hop.base[1], hop.base[2] + 0.5]} />);
  const ps = quakeParticlesAt(plan, ticks);
  const ringState = ringAt(ticks, boost.ring, ringFrames.length);
  const ring = ringState ? { half: ringState.half, m: ringMaterial(ringFrames[ringState.frame], ringState.opacity) } : null;
  return (
    <group>
      {nodes}
      {ps.length > 0 && <BreakParticleQuads tex={tex} items={ps} lit />}
      {ring && ring.half > 0 && <mesh geometry={ringGeometry} material={ring.m} position={[center[0], center[1], center[2] + 0.3]} scale={[ring.half, ring.half, 1]} />}
    </group>
  );
};
