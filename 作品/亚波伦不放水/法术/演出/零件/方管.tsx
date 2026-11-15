// 任意四边形面和方管：束.tsx 的 束 是交叉片、贴图只能沿长度走 v，这里补两样它做不了的——
// 四个面围成的方截面管（Goety 的 CorruptedBeamRenderer.drawBeam、WaterJetRenderer.renderJetLayer），可以收成尖（drawClosingBeam），贴图沿长度走 u 或 v 都行；
// 和 Goety 的 ModRenderType.magicBeam 那种不做深度测试的画法（隔着东西也看得见，照游戏原样）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Png } from '@engine/model/贴图.ts';
import type { Vec3 } from '../接口.ts';
import { addVec, sub, scaleVec, unitVec } from './弹道.ts';
import { faceMaterial, type FaceMaterialOptions } from './材质.ts';

type Vec2 = readonly [number, number];
/** 一个四边形：四个角（场景坐标，绕一圈）和各角的贴图坐标 [u, v] */
export type QuadVerts = { 点: readonly [Vec3, Vec3, Vec3, Vec3]; uv: readonly [Vec2, Vec2, Vec2, Vec2] };

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** 轴线的局部坐标：右（水平）、上（轴线水平时就是竖直朝上） */
export const axisFrame = (dir: Vec3): { 前: Vec3; right: Vec3; 上: Vec3 } => {
  const forward = unitVec(dir);
  const right = unitVec(cross(Math.abs(forward[2]) > 0.999 ? [1, 0, 0] : [0, 0, 1], forward));
  return { 前: forward, right, 上: cross(forward, right) };
};

const noDepthCache = new WeakMap<THREE.Material, THREE.Material>();

export const SquareTubeFaces: React.FC<
  FaceMaterialOptions & {
    quads: readonly QuadVerts[];
    图: Png | null;
    /** 不做深度测试（magicBeam）：被挡住也照画 */
    noDepthTest?: boolean;
    /** 同一处叠几层时的先后（three 的 renderOrder），大的后画 */
    序?: number;
  }
> = ({ quads, 图: image, noDepthTest, 序: renderIndex = 0, ...materialOpts }) => {
  const cacheKey = JSON.stringify(quads);
  const geo = useMemo(() => {
    const positions: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    quads.forEach((face, i) => {
      for (let k = 0; k < 4; k++) {
        positions.push(...face.点[k]!);
        uv.push(...face.uv[k]!);
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }, [cacheKey]);
  useEffect(() => () => geo.dispose(), [geo]);
  let m: THREE.Material = faceMaterial(image, materialOpts);
  if (noDepthTest) {
    let noDepthClone = noDepthCache.get(m);
    if (!noDepthClone) {
      noDepthClone = m.clone();
      noDepthClone.depthTest = false;
      noDepthCache.set(m, noDepthClone);
    }
    m = noDepthClone;
  }
  return quads.length > 0 ? <mesh geometry={geo} material={m} frustumCulled={false} renderOrder={renderIndex} /> : null;
};

/**
 * 方管的四个侧面（不封头）。贴图：横跨每个面 0～1，沿长度从 长起 到 长终（可以超出 0～1，配材质的 重复 做滚动）；沿 = 长度方向用贴图的哪个轴。
 * 偏 = 截面沿局部「上」平移多少（CorruptedBeam 的 −0.115）；收尖 = 终点那头四个角并成轴线上一点（不带 偏）。
 */
export const squareTubeFace = (startPos: Vec3, end: Vec3, halfWidth: number, opts: { alongAxis: 'u' | 'v'; lengthStart: number; lengthEnd: number; offset?: number; taper?: boolean }): QuadVerts[] => {
  const { 前: forward, right, 上: up } = axisFrame(sub(end, startPos));
  const extent = sub(end, startPos);
  if (forward[0] === 0 && forward[1] === 0 && forward[2] === 0) return [];
  const cornerPoint = (sx: number, sy: number): Vec3 => addVec(addVec(startPos, scaleVec(right, sx * halfWidth)), scaleVec(up, sy * halfWidth + (opts.offset ?? 0)));
  const farEnd = (p: Vec3): Vec3 => (opts.taper ? end : addVec(p, extent));
  const uvCoord = (across: number, vertical: number): Vec2 => (opts.alongAxis === 'v' ? [across, vertical] : [vertical, across]);
  const face = (a: Vec3, b: Vec3): QuadVerts => ({
    点: [a, farEnd(a), farEnd(b), b],
    uv: [uvCoord(0, opts.lengthStart), uvCoord(0, opts.lengthEnd), uvCoord(1, opts.lengthEnd), uvCoord(1, opts.lengthStart)],
  });
  return [face(cornerPoint(-1, 1), cornerPoint(-1, -1)), face(cornerPoint(1, 1), cornerPoint(1, -1)), face(cornerPoint(-1, 1), cornerPoint(1, 1)), face(cornerPoint(-1, -1), cornerPoint(1, -1))];
};
