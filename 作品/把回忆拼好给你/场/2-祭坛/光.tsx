// 第 3 句的光（演绎，三稿「祭坛亮起」「材料化成光」「她站在光里」；原版合成时什么光都没有）：照原版信标光柱那样硬边、不渐变、半透明，几档叠出浓淡。
// - 祭坛亮：圈里的地面（法阵那一层）上几层同心圆，圆边按 1/16 格（一个贴图像素）的格子走成阶梯，和方块贴图同一套像素；
// - 化成的光：柱顶材料变成末地烛那种 glitter 光点（原版粒子贴图），拖两颗小的往圈心上方飞；
// - 光柱：光点汇齐时罩下来几层方柱（信标光柱的方截面），她就站在里面出现，里面几颗 glitter 往上飘。
// 祭坛亮、光柱用普通的半透明叠（不用加法）：暖白加在草地上会加成黄绿色（核查 10-24），叠一层半透明暖白只把底下提亮、偏白。
// 半透明网格（MeshBasicMaterial、不写深度）平涂当不受光的；光点是 粒子面片 的 ShaderMaterial，平涂不碰。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { type V3 } from '@engine/model/parts.tsx';
import { type Particle, ParticleQuads } from '@库/特效/粒子面片.tsx';
import { vanillaParticleAtlas } from '@库/特效/原版粒子.tsx';
import * as params from './参数.ts';
import { events, floatStates, lightPillar, altarLight, toSec } from './编排.ts';
import { mulberry32 } from '@engine/core/数学.ts';

const translucentMaterial = (color: string, opacityStrength: number, side: THREE.Side = THREE.FrontSide, map: THREE.Texture | null = null) =>
  new THREE.MeshBasicMaterial({ color: color, map, transparent: true, opacity: opacityStrength, depthWrite: false, side });

/** 法阵那一层的高（altar.json 的 A1～A11 在 2 像素高），再抬一点免得和它打架 */
const groundLightHeight = 2 / 16 + 0.01;

/** 一贴图像素（格） */
const pixelSize = 1 / 16;
/** 半径 r 的圆片：边长取整到贴图像素的方片，贴一张按像素格算好的圆（格子中心在圆里就满、不在就空，最近邻采样），圆边是像素阶梯 */
const circleGeoms = new Map<number, { g: THREE.PlaneGeometry; tex: THREE.DataTexture }>();
const circle = (r: number) => {
  let c = circleGeoms.get(r);
  if (!c) {
    const n = Math.ceil(r / pixelSize);
    const side = 2 * n;
    const data = new Uint8Array(side * side * 4);
    for (let j = 0; j < side; j++)
      for (let i = 0; i < side; i++) {
        const [x, y] = [(i + 0.5 - n) * pixelSize, (j + 0.5 - n) * pixelSize];
        const k = (j * side + i) * 4;
        data.set([255, 255, 255, x * x + y * y <= r * r ? 255 : 0], k);
      }
    const tex = new THREE.DataTexture(data, side, side, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    circleGeoms.set(r, (c = { g: new THREE.PlaneGeometry(side * pixelSize, side * pixelSize), tex }));
  }
  return c;
};

const AltarLightLayer: React.FC<{ g: number }> = ({ g }) => {
  const altarGlowLayers = altarLight(g);
  const mats = useMemo(() => new Map(params.lightParams.altarLight.radiusList.map((r, i) => [r as number, translucentMaterial(params.lightParams.色, params.lightParams.altarLight.strength[i]!, THREE.FrontSide, circle(r).tex)])), []);
  return (
    <group position={[0, 0, groundLightHeight]}>
      {altarGlowLayers.map(([r]) => (
        <mesh key={r} geometry={circle(r).g} material={mats.get(r)!} />
      ))}
    </group>
  );
};

const pillarGeoms = new Map<number, THREE.BoxGeometry>();
const squarePillar = (w: number) => {
  let g = pillarGeoms.get(w);
  if (!g) {
    g = new THREE.BoxGeometry(w, w, params.lightParams.lightPillar.height);
    g.translate(0, 0, params.lightParams.lightPillar.height / 2);
    pillarGeoms.set(w, g);
  }
  return g;
};

/** 光柱只画方柱的背面：光罩在她身后、被她挡住，不叠在她身上（她头发、帽子本来近白，叠上去脸就看不出了） */
const LightPillarLayer: React.FC<{ g: number }> = ({ g }) => {
  const beamLayers = lightPillar(g);
  const mats = useMemo(() => new Map(params.lightParams.lightPillar.width.map((w, i) => [w as number, translucentMaterial(params.lightParams.色, params.lightParams.lightPillar.strength[i]!, THREE.BackSide)])), []);
  return (
    <group position={[params.liYing.feet[0], params.liYing.feet[1], 0]}>
      {beamLayers.map(([w]) => (
        <mesh key={w} geometry={squarePillar(w)} material={mats.get(w)!} />
      ))}
    </group>
  );
};

const warmWhite: [number, number, number] = (() => {
  const c = new THREE.Color(params.lightParams.色);
  return [c.r, c.g, c.b];
})();
const uv = (frame: number) => vanillaParticleAtlas.uv[`glitter_${Math.max(0, Math.min(7, Math.round(frame)))}`]!;

/** 这一帧的光点：材料化成的（往圈心飞）+ 光柱里往上飘的 */
export const lightDots = (g: number): Particle[] => {
  const out: Particle[] = [];
  for (const s of floatStates(g)) {
    if (s.kind !== '光') continue;
    out.push({ p: s.p, half: 0.16, uv: uv(7), color: warmWhite });
    s.trail.forEach((p, i) => out.push({ p, half: 0.1 - i * 0.03, uv: uv(5 - i * 2), color: warmWhite }));
  }
  const pillars = lightPillar(g);
  if (pillars.length) {
    const { 数: count, halfSize, seed: seed } = params.lightParams.lightDot;
    const r = mulberry32(seed);
    const elapsedSec = toSec(g) - toSec(events.appear) + params.lightParams.lightPillar.startBeforeSec;
    const beamWidth = params.lightParams.lightPillar.width[0]!;
    for (let i = 0; i < count; i++) {
      const [x, y, z0, v] = [(r() - 0.5) * beamWidth, (r() - 0.5) * beamWidth, r() * 2.2, 0.5 + r() * 0.6];
      const z = z0 + elapsedSec * v;
      // 光点的大小跟着光柱一档一档收（最外圈先灭）
      out.push({ p: [params.liYing.feet[0] + x, params.liYing.feet[1] + y, z] as V3, half: halfSize * (pillars.length / params.lightParams.lightPillar.width.length + 0.34), uv: uv(7 - (i % 4)), color: warmWhite });
    }
  }
  return out;
};

export const AltarLight: React.FC<{ g: number }> = ({ g }) => {
  const particles = useMemo(() => lightDots(g), [g]);
  return (
    <>
      <AltarLightLayer g={g} />
      <LightPillarLayer g={g} />
      <ParticleQuads tex={vanillaParticleAtlas.tex} items={particles} translucent depthWrite={false} />
    </>
  );
};
