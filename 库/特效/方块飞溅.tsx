// 方块飞溅：扫帚撞穿墙时，被撞开的那几格方块翻滚着飞出去（进塔向内、出塔向外）。第 1 场（6-1-5、6-1-7b、6-1-8、6-1-8b）在用。
// 碎块就是墙上原来那几格：工具/游戏取材/网格碎块.py 从场景网格取出洞里每一格和各面贴图，镜头里同一片区域用 `BlockMesh` 的 `hide` 藏掉，碎块从原位飞；洞旁方块朝洞的那面游戏没画，由同份数据补上（`lining`），洞壁才有厚度。
// 运动按时间参数算（无状态）：初速度 = 撞击方向×速度 + 从撞击点往外散开 + 随机，重力下落，绕随机轴匀速翻滚；另有几块 0.2～0.45 格的小碎渣。
// 穿墙分两部分（用户 10-02）：被动力钻头矛直接碰到的方块（矛尖连钻头虚影扫过的那一管，各段 编排.ts 给的 `管`）当场崩掉，原地画原版破坏粒子（方块破坏粒子.tsx；钻头再顺着离开矛轴的方向甩一把），矛尖扫到那刻崩；周围没被碰到的才整块飞出。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Png } from '../../engine/model/贴图.ts';
import { BreakParticleQuads } from './方块破坏粒子.tsx';
import { particleTexture } from './粒子面片.tsx';
import { DIRS, face, fullFaces, newBuf, tintsOf, type DebrisData, type FaceBuffer } from './方块碎块面.ts';
import { burstOpen, debrisFrame, planChips, spearTubeCells, type DebrisBurst, type NearHide } from './方块飞溅轨迹.ts';

// 面和染色在纯模块 方块碎块面.ts，运动在 方块飞溅轨迹.ts；这里只建几何、材质，把每帧算好的位置画出来。老代码照旧从这里引这些名字
export { DIRS, face, fullFaces, newBuf, tintsOf, type DebrisData, type DebrisFace } from './方块碎块面.ts';
export { closestOnTube, debrisNearHide, type DebrisBurst, type NearHide, type SpearTube } from './方块飞溅轨迹.ts';

export const toGeo = (buf: FaceBuffer) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
  geometry.setIndex(buf.idx);
  return geometry;
};

const texCache = new WeakMap<Png, THREE.DataTexture>();
export const atlasTex = (atlas: Png) => {
  let t = texCache.get(atlas);
  if (!t) {
    t = new THREE.DataTexture(atlas.px, atlas.w, atlas.h, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    texCache.set(atlas, t);
  }
  return t;
};

const matCache = new WeakMap<THREE.Texture, THREE.MeshStandardMaterial>();
// 两面都画（树叶这种镂空方块从窟窿里看得到里面的面）；打底的自发光也乘上顶点色（染色），不然草、树叶这类靠顶点色染绿的贴图会发灰（同 lib/方块网格.tsx）
export const debrisMat = (tex: THREE.Texture) => {
  let material = matCache.get(tex);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.95, alphaTest: 0.5, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35, side: THREE.DoubleSide });
    material.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;');
    };
    matCache.set(tex, material);
  }
  return material;
};

const fadeCache = new WeakMap<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial[]>();
const fadeSteps = 8;
const fadeMat = (baseMat: THREE.MeshStandardMaterial, alpha: number) => {
  let list = fadeCache.get(baseMat);
  if (!list) {
    list = Array.from({ length: fadeSteps }, (_, k) => {
      const faded = baseMat.clone();
      faded.onBeforeCompile = baseMat.onBeforeCompile;
      faded.transparent = true;
      faded.depthWrite = false;
      faded.opacity = (k + 0.5) / fadeSteps;
      faded.alphaTest = baseMat.alphaTest * faded.opacity; // 镂空贴图的透明像素照样丢（alphaTest 比的是 贴图 alpha × opacity）
      return faded;
    });
    fadeCache.set(baseMat, list);
  }
  return list[Math.min(fadeSteps - 1, Math.floor(alpha * fadeSteps))];
};
export const BlockDebris: React.FC<{ data: DebrisData; atlas: Png; bursts: DebrisBurst[]; fixWinding?: boolean; nearHide?: NearHide }> = ({ data, atlas, bursts, fixWinding = false, nearHide }) => {
  const tex = atlasTex(atlas);
  const mat = debrisMat(tex);
  // 外圈（`ring`）：每个盒子合成一个几何，原地画（往里收一丝，和场景网格里没藏掉的同一个面重合时让网格的面在前面）
  const rings = useMemo(() => {
    const per = bursts.map(() => newBuf());
    for (const cell of data.cells) {
      if (!cell.ring || !per[cell.box]) continue;
      const ff = fullFaces(cell.faces, tintsOf(data));
      const sz = cell.size ?? [1, 1, 1];
      const offset = cell.off ?? [0, 0, 0];
      const buf = per[cell.box];
      for (const dir of Object.keys(DIRS)) {
        const start = buf.pos.length;
        face(buf, [0, 0, 0], 0.4995, dir, ff[dir], fixWinding);
        for (let k = start; k < buf.pos.length; k += 3) {
          buf.pos[k] = buf.pos[k] * sz[0] + cell.p[0] + offset[0];
          buf.pos[k + 1] = buf.pos[k + 1] * sz[1] + cell.p[1] + offset[1];
          buf.pos[k + 2] = buf.pos[k + 2] * sz[2] + cell.p[2] + offset[2];
        }
      }
    }
    return per.map(toGeo);
  }, [data, bursts.length, fixWinding]);
  const pieces = useMemo(
    () =>
      data.cells.filter((c) => !c.ring).map((cell) => {
        const buf = newBuf();
        const ff = fullFaces(cell.faces, tintsOf(data));
        for (const dir of Object.keys(DIRS)) face(buf, [0, 0, 0], 0.5, dir, ff[dir], fixWinding);
        const geometry = toGeo(buf);
        // 不是整格的东西（画是 1/16 厚的板）：按实际大小缩
        if (cell.size) geometry.scale(cell.size[0], cell.size[1], cell.size[2]);
        return { cell, geo: geometry, faces: ff };
      }),
    [data, fixWinding],
  );
  const lining = useMemo(() => {
    const per = bursts.map(() => newBuf());
    for (const liningFace of data.lining ?? []) {
      let best = 0;
      let bd = Infinity;
      data.cells.forEach((cell) => {
        const dist = Math.hypot(cell.p[0] - liningFace.p[0], cell.p[1] - liningFace.p[1], cell.p[2] - liningFace.p[2]);
        if (dist < bd) {
          bd = dist;
          best = cell.box;
        }
      });
      const normal = DIRS[liningFace.d].n;
      // 面中心往背面退半格当方块中心，`face()` 会把面放回到中心 + 法线 × 0.5 处
      if (per[best]) face(per[best], [liningFace.p[0] - normal[0] * 0.5, liningFace.p[1] - normal[1] * 0.5, liningFace.p[2] - normal[2] * 0.5], 0.5, liningFace.d, liningFace.f, fixWinding);
    }
    return per.map(toGeo);
  }, [data, bursts.length, fixWinding]);
  const tubes = spearTubeCells(data, pieces, bursts);
  const chipGeos = useMemo(() => {
    return planChips(pieces, bursts, tubes).map(({ from, size }) => {
      const src = pieces[from];
      const buf = newBuf();
      for (const dir of Object.keys(DIRS)) {
        const faceData = src.faces[dir];
        const du = (faceData[2] - faceData[0]) * size;
        const dv = (faceData[3] - faceData[1]) * size;
        face(buf, [0, 0, 0], size / 2, dir, [faceData[0], faceData[1], faceData[0] + du, faceData[1] + dv, faceData[4], faceData[5], faceData[6]], fixWinding);
      }
      return { geo: toGeo(buf), size, from };
    });
    // bursts 每帧都是新数组（编排的 debrisBursts(t)），按它比就每帧重建几十个几何还不释放。碎渣只看每盒的 seed、chips 和矛管崩掉哪几格（tubes 按 管 对象缓存，同一个 管 同一张表）
  }, [pieces, fixWinding, bursts.length, ...bursts.flatMap((burst, bi) => [burst.seed, burst.chips, tubes[bi]])]);
  useEffect(() => () => chipGeos.forEach((chip) => chip.geo.dispose()), [chipGeos]);

  const frame = debrisFrame(pieces, chipGeos, bursts, tubes, nearHide);
  const nodes: React.ReactNode[] = [];
  for (const pose of frame.pieces) {
    const geo = pieces[pose.index].geo;
    if (pose.still) nodes.push(<mesh key={`c${pose.index}`} geometry={geo} material={mat} position={pose.pos as [number, number, number]} castShadow receiveShadow />);
    else {
      const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...pose.axis), pose.angle);
      nodes.push(<mesh key={`c${pose.index}`} geometry={geo} material={pose.alpha < 1 ? fadeMat(mat, pose.alpha) : mat} position={pose.pos} quaternion={quat} castShadow={pose.alpha >= 1} receiveShadow />);
    }
  }
  for (const pose of frame.chips) {
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...pose.axis), pose.angle);
    nodes.push(<mesh key={`k${pose.index}`} geometry={chipGeos[pose.index].geo} material={pose.alpha < 1 ? fadeMat(mat, pose.alpha) : mat} position={pose.pos} quaternion={quat} castShadow={pose.alpha >= 1} />);
  }
  return (
    <>
      {nodes}
      {frame.particles.length > 0 && <BreakParticleQuads tex={particleTexture(atlas.px, atlas.w, atlas.h, atlas)} items={frame.particles} />}
      {lining.map((g, i) => (burstOpen(bursts[i]) ? <mesh key={`l${i}`} geometry={g} material={mat} receiveShadow castShadow /> : null))}
      {rings.map((g, i) => (burstOpen(bursts[i]) ? <mesh key={`r${i}`} geometry={g} material={mat} receiveShadow castShadow /> : null))}
    </>
  );
};
