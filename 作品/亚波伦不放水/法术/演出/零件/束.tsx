// 束和带：从一点连到另一点的贴图条。
// 束：绕轴线交叉摆几片（原版信标光柱、守卫者激光、Goety 的 CorruptedBeam、WaterJet 都是这类），贴图沿长度方向走 v，可滚动。
// 带：沿一串点铺的四边形条（弹的尾迹 renderTrail、WindParticle 这类程序画的带子），宽的方向自己给，不朝镜头。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { Png } from '@engine/model/贴图.ts';
import type { 点 } from '../接口.ts';
import { 面材质, type 面材质选项 } from './材质.ts';

const 向量 = (p: 点) => new THREE.Vector3(p[0], p[1], p[2]);

const 四边形网格 = (顶点: number[], uv: number[]) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(顶点, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const idx: number[] = [];
  for (let i = 0; i < 顶点.length / 12; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  g.setIndex(idx);
  return g;
};

export type 束属性 = 面材质选项 & {
  起: 点;
  终: 点;
  图: Png | null;
  半宽: number;
  /** 绕轴线摆几片，默认 2（十字）；每片隔 180° ÷ 片数 */
  片数?: number;
  /** 整束绕轴线转的弧度（守卫者激光那种慢转） */
  转角?: number;
  /** 起、终两头的贴图 v（可以超出 0～1，配 重复 做滚动）；默认 0、1。u 横跨整张 */
  v起?: number;
  v终?: number;
  /** 贴图只取横向的一段 [u0, u1]，默认 [0, 1] */
  u?: readonly [number, number];
};

export const 束: React.FC<束属性> = ({ 起, 终, 图, 半宽, 片数 = 2, 转角 = 0, v起 = 0, v终 = 1, u = [0, 1], ...材 }) => {
  const geo = useMemo(() => {
    const a = 向量(起);
    const b = 向量(终);
    const 轴 = b.clone().sub(a);
    if (轴.lengthSq() === 0) return null;
    轴.normalize();
    // 取一个和轴垂直的基准方向：轴接近竖直时用 x，否则用竖直叉出来
    const 基 = Math.abs(轴.z) > 0.999 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1).cross(轴).normalize();
    const 顶点: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i < 片数; i++) {
      const 侧 = 基.clone().applyAxisAngle(轴, 转角 + (i * Math.PI) / 片数).multiplyScalar(半宽);
      for (const p of [a.clone().sub(侧), a.clone().add(侧), b.clone().add(侧), b.clone().sub(侧)]) 顶点.push(p.x, p.y, p.z);
      uv.push(u[0], v起, u[1], v起, u[1], v终, u[0], v终);
    }
    return 四边形网格(顶点, uv);
  }, [起[0], 起[1], 起[2], 终[0], 终[1], 终[2], 半宽, 片数, 转角, v起, v终, u[0], u[1]]);
  return geo ? <mesh geometry={geo} material={面材质(图, 材)} frustumCulled={false} /> : null;
};

export type 带属性 = 面材质选项 & {
  /** 中线上的点，至少 2 个 */
  点们: readonly 点[];
  /** 每个点往两边各伸多少（向量，场景坐标）：一个 = 全程一样，数组 = 逐点 */
  半宽向: 点 | readonly 点[];
  图: Png | null;
  /** 各点的贴图 u（沿带子方向）；不给 = 从 0 到 1 均分。v 横跨带宽（0 在 −半宽向 那边） */
  u们?: readonly number[];
};

export const 带: React.FC<带属性> = ({ 点们, 半宽向, 图, u们, ...材 }) => {
  const 键 = JSON.stringify([点们, 半宽向, u们]);
  const geo = useMemo(() => {
    if (点们.length < 2) return null;
    const 侧 = (i: number) => 向量((typeof 半宽向[0] === 'number' ? 半宽向 : (半宽向 as readonly 点[])[i]!) as 点);
    const 顶点: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i + 1 < 点们.length; i++) {
      const [a, b] = [向量(点们[i]!), 向量(点们[i + 1]!)];
      const [sa, sb] = [侧(i), 侧(i + 1)];
      const [ua, ub] = [u们?.[i] ?? i / (点们.length - 1), u们?.[i + 1] ?? (i + 1) / (点们.length - 1)];
      for (const p of [a.clone().sub(sa), b.clone().sub(sb), b.clone().add(sb), a.clone().add(sa)]) 顶点.push(p.x, p.y, p.z);
      uv.push(ua, 1, ub, 1, ub, 0, ua, 0);
    }
    return 四边形网格(顶点, uv);
  }, [键]);
  return geo ? <mesh geometry={geo} material={面材质(图, 材)} frustumCulled={false} /> : null;
};
