// 电弧折线（Goety 的 LightningEffect）：形状在 电弧形.ts。画法照 ModRenderType.LIGHTNING：只有位置和颜色、没有贴图，加色混合、不写深度。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { Vec3 } from '../接口.ts';
import { faceMaterial, type RgbColor } from './材质.ts';
import { generateArc, visibleSegRange, type ArcSettings } from './电弧形.ts';

export const ElectricArc: React.FC<{
  start: Vec3;
  end: Vec3;
  settings: ArcSettings;
  /** 这道电弧活了几刻（带小数）；< 0 或 ≥ 寿命刻 不画 */
  刻: number;
  lifeTicks: number;
  色: RgbColor;
  /** 游戏里 ColorUtil 的 alpha：默认配色 0.8，雷霆这类只给 RGB 的是 1 */
  opacity?: number;
  seed: number;
}> = ({ start: startPos, end, settings, 刻: tick, lifeTicks, 色: color, opacity = 1, seed: seed }) => {
  const arcSegs = useMemo(() => generateArc(startPos, end, settings, seed), [startPos[0], startPos[1], startPos[2], end[0], end[1], end[2], settings, seed]);
  const [segFrom, segTo] = tick < 0 || tick >= lifeTicks ? [0, 0] : visibleSegRange(arcSegs.length, tick / lifeTicks);
  const geo = useMemo(() => {
    if (segTo <= segFrom) return null;
    const positions: number[] = [];
    const idx: number[] = [];
    for (let i = segFrom; i < segTo; i++) {
      const bottomIndex = positions.length / 3;
      for (const p of arcSegs[i]!) positions.push(p[0], p[1], p[2]);
      for (let q = 0; q < 4; q++) idx.push(bottomIndex + q * 4, bottomIndex + q * 4 + 1, bottomIndex + q * 4 + 2, bottomIndex + q * 4, bottomIndex + q * 4 + 2, bottomIndex + q * 4 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(idx);
    return g;
  }, [arcSegs, segFrom, segTo]);
  // 每段的两个面各画了正反两遍（照原样），所以只画正面，不然亮度翻倍
  const material = useMemo(() => {
    const m = faceMaterial(null, { blend: '加色', 色: color, opacity }).clone();
    m.side = THREE.FrontSide;
    return m;
  }, [color[0], color[1], color[2], opacity]);
  return geo ? <mesh geometry={geo} material={material} frustumCulled={false} /> : null;
};
