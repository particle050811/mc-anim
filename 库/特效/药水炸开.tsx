// 药水炸开：喷溅药水砸中东西时游戏放的粒子，照 1.20.1 `LevelRenderer.levelEvent` 2007（瞬间效果药水，治疗药水就是这种）：
// - 8 个物品碎片粒子（`ItemParticle`：喷溅药水贴图里随机一块 1/4 见方的碎片），初速度 (高斯×0.15, 随机×0.2, 高斯×0.15) 格/刻，受重力；
// - 100 个 instant_effect 粒子（`SpellParticle`，贴图 spell_7 → spell_0 逐帧变小），颜色 = 药水颜色 × (0.75～1)，从落点周围 0.4 格内、高 0.3 格处向四周散开（速度乘 0～4 的 power），每刻速度乘 0.96、慢慢上飘，寿命 8～40 刻。
// 贴图照抄 client jar（npm run 取材 -- 药水）。和游戏不同的两处：粒子画大 1.4 倍（参考视频里游戏尺寸看不见）；颜色往白里掺一半（`lighten`，默认 0.5）：治疗药水是正红，一团红点糊在生物身上会被视频模型当成血（用户 09-30 定：不要血、不要红）。
// 粒子是始终朝向镜头的贴片，不受光。sec = 砸中以后经过的秒数（< 0 不显示），1 秒 20 刻。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rng, type V3 } from '../../engine/model/parts.tsx';
import { pngDir } from '../../engine/model/贴图.ts';
import { POTION_TEX } from '../物品/喷溅药水.tsx';
import { 资产目录 } from '../../engine/core/资产目录.ts';
import 资_0 from 'asset:贴图/特效/药水粒子/effect_0';
import 资_1 from 'asset:贴图/特效/药水粒子/effect_1';
import 资_2 from 'asset:贴图/特效/药水粒子/effect_2';
import 资_3 from 'asset:贴图/特效/药水粒子/effect_3';
import 资_4 from 'asset:贴图/特效/药水粒子/effect_4';
import 资_5 from 'asset:贴图/特效/药水粒子/effect_5';
import 资_6 from 'asset:贴图/特效/药水粒子/effect_6';
import 资_7 from 'asset:贴图/特效/药水粒子/effect_7';
import 资_8 from 'asset:贴图/特效/药水粒子/spell_0';
import 资_9 from 'asset:贴图/特效/药水粒子/spell_1';
import 资_10 from 'asset:贴图/特效/药水粒子/spell_2';
import 资_11 from 'asset:贴图/特效/药水粒子/spell_3';
import 资_12 from 'asset:贴图/特效/药水粒子/spell_4';
import 资_13 from 'asset:贴图/特效/药水粒子/spell_5';
import 资_14 from 'asset:贴图/特效/药水粒子/spell_6';
import 资_15 from 'asset:贴图/特效/药水粒子/spell_7';

const spellPngs = pngDir(资产目录({ './effect_0.png': 资_0, './effect_1.png': 资_1, './effect_2.png': 资_2, './effect_3.png': 资_3, './effect_4.png': 资_4, './effect_5.png': 资_5, './effect_6.png': 资_6, './effect_7.png': 资_7, './spell_0.png': 资_8, './spell_1.png': 资_9, './spell_2.png': 资_10, './spell_3.png': 资_11, './spell_4.png': 资_12, './spell_5.png': 资_13, './spell_6.png': 资_14, './spell_7.png': 资_15 }));
const VISUAL_SCALE = 1.4;

const flipRows = (px: Uint8Array, width: number, height: number) => {
  const out = new Uint8Array(px.length);
  for (let y = 0; y < height; y++) out.set(px.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
  return out;
};
const texCache = new Map<string, THREE.DataTexture>();
const spriteTex = (name: string) => {
  let t = texCache.get(name);
  if (!t) {
    const img = spellPngs[name];
    t = new THREE.DataTexture(flipRows(img.px, img.w, img.h), img.w, img.h, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    texCache.set(name, t);
  }
  return t;
};
const matCache = new Map<string, THREE.SpriteMaterial>();
const spellMat = (name: string, color: THREE.Color) => {
  const key = `${name}|${color.getHexString()}`;
  let material = matCache.get(key);
  if (!material) {
    material = new THREE.SpriteMaterial({ map: spriteTex(name), color, transparent: true, alphaTest: 0.05, depthWrite: false, fog: false });
    matCache.set(key, material);
  }
  return material;
};
// 物品碎片：药水贴图（瓶身叠染色药液）里的一块
const chipCache = new Map<string, THREE.SpriteMaterial>();
const chipMat = (uo: number, vo: number, color: string) => {
  const key = `${uo}|${vo}|${color}`;
  let material = chipCache.get(key);
  if (!material) {
    const bottle = POTION_TEX.bottle;
    const overlay = POTION_TEX.overlay;
    const potionColor = new THREE.Color(color);
    const linearToSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
    const tint = [linearToSrgb(potionColor.r), linearToSrgb(potionColor.g), linearToSrgb(potionColor.b)];
    const px = new Uint8Array(4 * 4 * 4);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const sx = uo * 4 + x;
        const sy = vo * 4 + y;
        const i = (sy * 16 + sx) * 4;
        const j = ((3 - y) * 4 + x) * 4;
        if (bottle.px[i + 3] > 0) px.set([bottle.px[i], bottle.px[i + 1], bottle.px[i + 2], 255], j);
        else if (overlay.px[i + 3] > 0) px.set([overlay.px[i] * tint[0], overlay.px[i + 1] * tint[1], overlay.px[i + 2] * tint[2], 255], j);
      }
    const t = new THREE.DataTexture(px, 4, 4, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    material = new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.5, depthWrite: false, fog: false });
    chipCache.set(key, material);
  }
  return material;
};

const gauss = (rand: () => number) => {
  const uniformSample = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(uniformSample)) * Math.cos(2 * Math.PI * rand());
};

type Spell = { p: V3; v: V3; life: number; half: number; color: THREE.Color };
type Chip = { p: V3; v: V3; life: number; half: number; uo: number; vo: number };

// at：砸中的位置（游戏里 `Vec3.atBottomCenterOf(pos)`，这里直接给落点）；color：药水颜色；up：场景里的"上"（默认 Z），粒子的上飘、重力沿它
// count：效果粒子的个数（游戏里 100；几瓶砸在同一处时可以减少，免得糊住目标）
export const PotionSplash: React.FC<{ at: V3; sec: number; seed: number; color: string; lighten?: number; count?: number }> = ({ at, sec, seed, color, lighten = 0.5, count = 100 }) => {
  const { spells, chips } = useMemo(() => {
    const rand = rng(seed * 4099 + 11);
    const base = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), lighten);
    const chips: Chip[] = Array.from({ length: 8 }, () => {
      // Particle 构造函数里的随机速度 ×0.1 再加上给定的速度
      const rv = () => (rand() * 2 - 1) * 0.4 * 0.1;
      return {
        p: [...at] as V3,
        v: [gauss(rand) * 0.15 + rv(), gauss(rand) * 0.15 + rv(), rand() * 0.2 + rv()] as V3,
        life: Math.floor(4 / (rand() * 0.9 + 0.1)),
        half: 0.1 * (rand() * 0.5 + 0.5) * 2 * 0.5,
        uo: Math.floor(rand() * 4),
        vo: Math.floor(rand() * 4),
      };
    });
    const spells: Spell[] = Array.from({ length: count }, () => {
      const power = rand() * 4;
      const angle = rand() * Math.PI * 2;
      const d2 = Math.cos(angle) * power;
      const d4 = Math.sin(angle) * power;
      const d3 = 0.01 + rand() * 0.5;
      // `SpellParticle`：传给 Particle 的水平速度是 0.5 - 随机，竖直是 d3；Particle 再加随机、归一化到 (随机+随机+1)×0.15×0.4
      let x = 0.5 - rand() + (rand() * 2 - 1) * 0.4;
      let y = d3 + (rand() * 2 - 1) * 0.4;
      let z = 0.5 - rand() + (rand() * 2 - 1) * 0.4;
      const len = Math.hypot(x, y, z) || 1;
      const speed = (rand() + rand() + 1) * 0.15 * 0.4;
      x = (x / len) * speed;
      y = (y / len) * speed + 0.1;
      z = (z / len) * speed;
      y *= 0.2;
      x *= power;
      y = (y - 0.1) * power + 0.1;
      z *= power;
      const f3 = 0.75 + rand() * 0.25;
      // MC 坐标（y 朝上）→ 场景（z 朝上）：(x, z, y) 里南北随便取，这里 (x, -z, y)
      return {
        p: [at[0] + d2 * 0.1, at[1] - d4 * 0.1, at[2] + 0.3] as V3,
        v: [x, -z, y] as V3,
        life: Math.floor(8 / (rand() * 0.8 + 0.2)),
        half: 0.1 * (rand() * 0.5 + 0.5) * 2 * 0.75,
        color: base.clone().multiplyScalar(f3),
      };
    });
    return { spells, chips };
  }, [at[0], at[1], at[2], seed, color, lighten, count]);
  if (sec < 0) return null;
  const tick = sec * 20;
  const out: React.ReactNode[] = [];
  spells.forEach((spell, i) => {
    if (tick >= spell.life) return;
    // 每刻：位置 += 速度；速度 ×0.96；竖直速度 += 0.004（gravity -0.1 × 0.04）
    const k = (1 - 0.96 ** tick) / 0.04;
    const rise = 0.004 * (tick - k) / 0.04; // Σ 0.004×(1-0.96^n)/0.04 的闭式近似
    const pos: V3 = [spell.p[0] + spell.v[0] * k, spell.p[1] + spell.v[1] * k, spell.p[2] + spell.v[2] * k + rise];
    const idx = 7 - Math.min(7, Math.floor((tick / spell.life) * 8));
    const spriteSize = spell.half * 2 * VISUAL_SCALE;
    out.push(<sprite key={`s${i}`} position={pos} scale={[spriteSize, spriteSize, 1]} material={spellMat(`spell_${idx}`, spell.color)} />);
  });
  chips.forEach((chip, i) => {
    if (tick >= chip.life) return;
    // 每刻：速度 ×0.98，竖直 -= 0.04（gravity 1.0）
    const k = (1 - 0.98 ** tick) / 0.02;
    const fall = 0.04 * (tick - k) / 0.02;
    const pos: V3 = [chip.p[0] + chip.v[0] * k, chip.p[1] + chip.v[1] * k, chip.p[2] + chip.v[2] * k - fall];
    const spriteSize = chip.half * 2 * VISUAL_SCALE;
    out.push(<sprite key={`c${i}`} position={pos} scale={[spriteSize, spriteSize, 1]} material={chipMat(chip.uo, chip.vo, color)} />);
  });
  return <>{out}</>;
};
