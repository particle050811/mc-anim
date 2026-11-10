// 电弧折线（Goety 的 LightningEffect）：形状在 电弧形.ts。画法照 ModRenderType.LIGHTNING：只有位置和颜色、没有贴图，加色混合、不写深度。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { 点 } from '../接口.ts';
import { 面材质, type 色 } from './材质.ts';
import { 生成电弧, 电弧可见段, type 电弧设定 } from './电弧形.ts';

export const 电弧: React.FC<{
  起: 点;
  终: 点;
  设定: 电弧设定;
  /** 这道电弧活了几刻（带小数）；< 0 或 ≥ 寿命刻 不画 */
  刻: number;
  寿命刻: number;
  色: 色;
  /** 游戏里 ColorUtil 的 alpha：默认配色 0.8，雷霆这类只给 RGB 的是 1 */
  透明度?: number;
  种子: number;
}> = ({ 起, 终, 设定, 刻, 寿命刻, 色, 透明度 = 1, 种子 }) => {
  const 段 = useMemo(() => 生成电弧(起, 终, 设定, 种子), [起[0], 起[1], 起[2], 终[0], 终[1], 终[2], 设定, 种子]);
  const [始, 止] = 刻 < 0 || 刻 >= 寿命刻 ? [0, 0] : 电弧可见段(段.length, 刻 / 寿命刻);
  const geo = useMemo(() => {
    if (止 <= 始) return null;
    const 位: number[] = [];
    const idx: number[] = [];
    for (let i = 始; i < 止; i++) {
      const 底 = 位.length / 3;
      for (const p of 段[i]!) 位.push(p[0], p[1], p[2]);
      for (let q = 0; q < 4; q++) idx.push(底 + q * 4, 底 + q * 4 + 1, 底 + q * 4 + 2, 底 + q * 4, 底 + q * 4 + 2, 底 + q * 4 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(位, 3));
    g.setIndex(idx);
    return g;
  }, [段, 始, 止]);
  // 每段的两个面各画了正反两遍（照原样），所以只画正面，不然亮度翻倍
  const 材质 = useMemo(() => {
    const m = 面材质(null, { 混合: '加色', 色, 透明度 }).clone();
    m.side = THREE.FrontSide;
    return m;
  }, [色[0], 色[1], 色[2], 透明度]);
  return geo ? <mesh geometry={geo} material={材质} frustumCulled={false} /> : null;
};
