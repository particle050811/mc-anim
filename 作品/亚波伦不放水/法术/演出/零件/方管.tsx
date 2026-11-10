// 任意四边形面和方管：束.tsx 的 束 是交叉片、贴图只能沿长度走 v，这里补两样它做不了的——
// 四个面围成的方截面管（Goety 的 CorruptedBeamRenderer.drawBeam、WaterJetRenderer.renderJetLayer），可以收成尖（drawClosingBeam），贴图沿长度走 u 或 v 都行；
// 和 Goety 的 ModRenderType.magicBeam 那种不做深度测试的画法（隔着东西也看得见，照游戏原样）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Png } from '@engine/model/贴图.ts';
import type { 点 } from '../接口.ts';
import { 加, 减, 乘, 单位 } from './弹道.ts';
import { 面材质, type 面材质选项 } from './材质.ts';

type 二 = readonly [number, number];
/** 一个四边形：四个角（场景坐标，绕一圈）和各角的贴图坐标 [u, v] */
export type 四边 = { 点: readonly [点, 点, 点, 点]; uv: readonly [二, 二, 二, 二] };

const 叉 = (a: 点, b: 点): 点 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** 轴线的局部坐标：右（水平）、上（轴线水平时就是竖直朝上） */
export const 轴架 = (向: 点): { 前: 点; 右: 点; 上: 点 } => {
  const 前 = 单位(向);
  const 右 = 单位(叉(Math.abs(前[2]) > 0.999 ? [1, 0, 0] : [0, 0, 1], 前));
  return { 前, 右, 上: 叉(前, 右) };
};

const 不测深度 = new WeakMap<THREE.Material, THREE.Material>();

export const 四边面们: React.FC<
  面材质选项 & {
    面们: readonly 四边[];
    图: Png | null;
    /** 不做深度测试（magicBeam）：被挡住也照画 */
    无深度测试?: boolean;
    /** 同一处叠几层时的先后（three 的 renderOrder），大的后画 */
    序?: number;
  }
> = ({ 面们, 图, 无深度测试, 序 = 0, ...材 }) => {
  const 键 = JSON.stringify(面们);
  const geo = useMemo(() => {
    const 位: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    面们.forEach((面, i) => {
      for (let k = 0; k < 4; k++) {
        位.push(...面.点[k]!);
        uv.push(...面.uv[k]!);
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(位, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }, [键]);
  useEffect(() => () => geo.dispose(), [geo]);
  let m: THREE.Material = 面材质(图, 材);
  if (无深度测试) {
    let 克 = 不测深度.get(m);
    if (!克) {
      克 = m.clone();
      克.depthTest = false;
      不测深度.set(m, 克);
    }
    m = 克;
  }
  return 面们.length > 0 ? <mesh geometry={geo} material={m} frustumCulled={false} renderOrder={序} /> : null;
};

/**
 * 方管的四个侧面（不封头）。贴图：横跨每个面 0～1，沿长度从 长起 到 长终（可以超出 0～1，配材质的 重复 做滚动）；沿 = 长度方向用贴图的哪个轴。
 * 偏 = 截面沿局部「上」平移多少（CorruptedBeam 的 −0.115）；收尖 = 终点那头四个角并成轴线上一点（不带 偏）。
 */
export const 方管面 = (起: 点, 终: 点, 半宽: number, 选: { 沿: 'u' | 'v'; 长起: number; 长终: number; 偏?: number; 收尖?: boolean }): 四边[] => {
  const { 前, 右, 上 } = 轴架(减(终, 起));
  const 全 = 减(终, 起);
  if (前[0] === 0 && 前[1] === 0 && 前[2] === 0) return [];
  const 角 = (sx: number, sy: number): 点 => 加(加(起, 乘(右, sx * 半宽)), 乘(上, sy * 半宽 + (选.偏 ?? 0)));
  const 远 = (p: 点): 点 => (选.收尖 ? 终 : 加(p, 全));
  const 坐标 = (横: number, 纵: number): 二 => (选.沿 === 'v' ? [横, 纵] : [纵, 横]);
  const 面 = (a: 点, b: 点): 四边 => ({
    点: [a, 远(a), 远(b), b],
    uv: [坐标(0, 选.长起), 坐标(0, 选.长终), 坐标(1, 选.长终), 坐标(1, 选.长起)],
  });
  return [面(角(-1, 1), 角(-1, -1)), 面(角(1, 1), 角(1, -1)), 面(角(-1, 1), 角(1, 1)), 面(角(-1, -1), 角(1, -1))];
};
