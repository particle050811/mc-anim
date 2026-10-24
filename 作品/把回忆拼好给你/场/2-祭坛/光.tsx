// 第 3 句的光（演绎，三稿「祭坛亮起」「材料化成光」「她站在光里」；原版合成时什么光都没有）：照原版信标光柱那样硬边、不渐变、半透明叠加，几档叠出浓淡。
// - 祭坛亮：圈里的地面（法阵那一层）上几层同心圆，叠加混合；
// - 化成的光：柱顶材料变成末地烛那种 glitter 光点（原版粒子贴图），拖两颗小的往圈心上方飞；
// - 光柱：她头顶罩下来几层方柱（信标光柱的方截面），里面几颗 glitter 往上飘。
// 叠加的半透明网格（MeshBasicMaterial、不写深度）平涂当不受光的；光点是 粒子面片 的 ShaderMaterial，平涂不碰。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rng, type V3 } from '@engine/model/parts.tsx';
import { type Particle, ParticleQuads } from '@库/特效/粒子面片.tsx';
import { vanillaParticleAtlas } from '@库/特效/原版粒子.tsx';
import * as 参 from './参数.ts';
import { 事, 浮物态们, 光柱, 祭坛亮, 秒 } from './编排.ts';

const 叠加材质 = (色: string, 强: number, side: THREE.Side = THREE.FrontSide) =>
  new THREE.MeshBasicMaterial({ color: 色, transparent: true, opacity: 强, blending: THREE.AdditiveBlending, depthWrite: false, side });

/** 法阵那一层的高（altar.json 的 A1～A11 在 2 像素高），再抬一点免得和它打架 */
const 地光高 = 2 / 16 + 0.01;

const 圆们 = new Map<number, THREE.CircleGeometry>();
const 圆 = (r: number) => {
  let g = 圆们.get(r);
  if (!g) 圆们.set(r, (g = new THREE.CircleGeometry(r, 64)));
  return g;
};

const 祭坛亮层: React.FC<{ g: number }> = ({ g }) => {
  const 层 = 祭坛亮(g);
  const mats = useMemo(() => new Map(参.光.祭坛亮.半径.map((r, i) => [r as number, 叠加材质(参.光.色, 参.光.祭坛亮.强[i]!)])), []);
  return (
    <group position={[0, 0, 地光高]}>
      {层.map(([r]) => (
        <mesh key={r} geometry={圆(r)} material={mats.get(r)!} />
      ))}
    </group>
  );
};

const 柱们 = new Map<number, THREE.BoxGeometry>();
const 方柱 = (w: number) => {
  let g = 柱们.get(w);
  if (!g) {
    g = new THREE.BoxGeometry(w, w, 参.光.光柱.高);
    g.translate(0, 0, 参.光.光柱.高 / 2);
    柱们.set(w, g);
  }
  return g;
};

/** 光柱只画方柱的背面：光罩在她身后、被她挡住，不叠在她身上（她头发、帽子本来近白，叠上去脸和抬头就看不出了） */
const 光柱层: React.FC<{ g: number }> = ({ g }) => {
  const 层 = 光柱(g);
  const mats = useMemo(() => new Map(参.光.光柱.宽.map((w, i) => [w as number, 叠加材质(参.光.色, 参.光.光柱.强[i]!, THREE.BackSide)])), []);
  return (
    <group position={[参.她.脚[0], 参.她.脚[1], 0]}>
      {层.map(([w]) => (
        <mesh key={w} geometry={方柱(w)} material={mats.get(w)!} />
      ))}
    </group>
  );
};

const 暖白: [number, number, number] = (() => {
  const c = new THREE.Color(参.光.色);
  return [c.r, c.g, c.b];
})();
const uv = (帧: number) => vanillaParticleAtlas.uv[`glitter_${Math.max(0, Math.min(7, Math.round(帧)))}`]!;

/** 这一帧的光点：材料化成的（往圈心飞）+ 光柱里往上飘的 */
export const 光点们 = (g: number): Particle[] => {
  const out: Particle[] = [];
  for (const s of 浮物态们(g)) {
    if (s.样 !== '光') continue;
    out.push({ p: s.p, half: 0.16, uv: uv(7), color: 暖白 });
    s.尾.forEach((p, i) => out.push({ p, half: 0.1 - i * 0.03, uv: uv(5 - i * 2), color: 暖白 }));
  }
  const 柱 = 光柱(g);
  if (柱.length) {
    const { 数, 半, 种子 } = 参.光.光点;
    const r = rng(种子);
    const 已 = 秒(g) - 秒(事.光 - 参.光.光柱.起前帧);
    const 宽 = 参.光.光柱.宽[0]!;
    for (let i = 0; i < 数; i++) {
      const [x, y, z0, v] = [(r() - 0.5) * 宽, (r() - 0.5) * 宽, r() * 2.2, 0.5 + r() * 0.6];
      const z = z0 + 已 * v;
      // 光点的大小跟着光柱一档一档收（最外圈先灭）
      out.push({ p: [参.她.脚[0] + x, 参.她.脚[1] + y, z] as V3, half: 半 * (柱.length / 参.光.光柱.宽.length + 0.34), uv: uv(7 - (i % 4)), color: 暖白 });
    }
  }
  return out;
};

export const 祭坛光: React.FC<{ g: number }> = ({ g }) => {
  const 点 = useMemo(() => 光点们(g), [g]);
  return (
    <>
      <祭坛亮层 g={g} />
      <光柱层 g={g} />
      <ParticleQuads tex={vanillaParticleAtlas.tex} items={点} translucent depthWrite={false} />
    </>
  );
};
