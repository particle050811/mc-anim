// 夜幕刀光的刀光拖尾 `BladeTrail`：
// 一、刀光拖尾（夜幕 BloomTrailParticle，继承 Epic Fight 的 AnimationTrailParticle / AbstractTrailParticle）：
//   - 阎魔刀参数在 assets/efn/item_skins/yamato_dmc.json 的 trail：颜色 [120,120,120]，begin_pos (0,0.2,-0.5)、end_pos (0,0.4,-2.05)，lifetime 4 刻，贴图 power3.png。
//   - 形状：每刻在刀上取根、尖两点的世界坐标攒成一串“边”，相邻两边连成四边形。每条边活 lifetime 刻，最老一刻按 partialTick 往里收，
//     所以画面上始终是最近 (lifetime − 1) 刻 = 0.15 秒的扫过面。这里不用贝塞尔，直接按 1/480 秒一条取编排给的真实刀位。
//   - 贴图坐标：u 沿拖尾（最老 0、刀所在端 1），v 根 1、尖 0；顶点透明度 = clamp(u)，动作结束后（`止`）整条再乘 fading 线性淡到 0。边缘 CLAMP、最近邻。
//   - power3.png 自身不亮（乘 120/255 的灰），亮全靠泛光。
//   - 尺寸换到李樱的刀上：阎魔刀 begin/end 之比 0.244，李樱刀尖在握持点前 21.2 像素（拔刀剑.tsx），所以根取 21.2 × 0.244 = 5.2 像素、尖取刀尖；y 偏移不搬，取刀身中心线（`bladeCenterY`）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '../../../engine/model/parts.tsx';
import { bloomLayer, bloomMaterial, bloomTexture } from './共用.tsx';

// 阎魔刀（yamato_dmc.json 的 trail）
export const yamato = {
  color: 120 / 255,
  lifeTicks: 4,
  rootRatio: 0.5 / 2.05,
};

// 李樱的刀（拔刀剑.tsx 出鞘坐标系，MC 像素，刀身沿 +Z）：刀尖 21.2，根按阎魔刀的比例
export const liYingTrailPts = { root: 21.2 * yamato.rootRatio, tip: 21.2 };

const edgesPerSec = 480;
const visibleSec = (yamato.lifeTicks - 1) / 20;
const fadeOutSec = yamato.lifeTicks / 20;

const trailTexture = () => bloomTexture('power3');

export type BladePos = { root: V3; tip: V3 };

// 当前秒能看见的那串边（时间从老到新）和整体淡出系数。visible、fadeOut 给了就换掉游戏的 0.15、0.2 秒（慢放里按画面时间算，见 6-4-3/打斗编排.ts）
export const trailEdges = (bladeAt: (sec: number) => BladePos, startSec: number, endSec: number, sec: number, visible = visibleSec, fadeOut = fadeOutSec) => {
  const newestSec = Math.min(sec, endSec);
  const oldestSec = Math.max(startSec, sec - visible);
  if (sec < startSec || newestSec <= oldestSec) return null;
  const fading = sec <= endSec ? 1 : Math.max(0, 1 - (sec - endSec) / fadeOut);
  if (fading <= 0) return null;
  const edgeCount = Math.max(1, Math.ceil((newestSec - oldestSec) * edgesPerSec));
  const edges: (BladePos & { u: number })[] = [];
  for (let i = 0; i <= edgeCount; i++) {
    const texU = i / edgeCount;
    edges.push({ ...bladeAt(oldestSec + (newestSec - oldestSec) * texU), u: texU });
  }
  return { edges: edges, fading };
};

export const BladeTrail: React.FC<{ bladeAt: (sec: number) => BladePos; startSec: number; endSec: number; sec: number; visibleSec?: number; fadeOutSec?: number }> = ({ bladeAt, startSec: startSec, endSec: endSec, sec: sec, visibleSec: visible, fadeOutSec: fadeOut }) => {
  const mesh = useMemo(() => {
    const trailMesh = new THREE.Mesh(new THREE.BufferGeometry(), bloomMaterial(trailTexture(), yamato.color));
    trailMesh.frustumCulled = false;
    trailMesh.layers.set(bloomLayer);
    trailMesh.renderOrder = 20;
    return trailMesh;
  }, []);
  useEffect(() => () => (mesh.material as THREE.Material).dispose(), [mesh]);
  const geo = useMemo(() => {
    const trail = trailEdges(bladeAt, startSec, endSec, sec, visible, fadeOut);
    if (!trail) return null;
    const { edges: edges, fading } = trail;
    const pos: number[] = [];
    const uv: number[] = [];
    const alphas: number[] = [];
    const idx: number[] = [];
    edges.forEach((edge, i) => {
      // 根 v = 1、尖 v = 0
      pos.push(...edge.root, ...edge.tip);
      uv.push(edge.u, 1, edge.u, 0);
      const al = Math.min(1, Math.max(0, edge.u)) * fading;
      alphas.push(al, al);
      if (i > 0) {
        const k = 2 * i;
        idx.push(k - 2, k - 1, k + 1, k - 2, k + 1, k);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1));
    geometry.setIndex(idx);
    return geometry;
  }, [sec, startSec, endSec, bladeAt, visible, fadeOut]);
  useEffect(() => () => geo?.dispose(), [geo]);
  if (!geo) return null;
  mesh.geometry = geo;
  return <primitive object={mesh} />;
};
