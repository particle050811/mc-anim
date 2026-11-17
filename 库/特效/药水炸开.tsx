// 药水炸开：喷溅药水砸中东西时游戏放的粒子，照 1.20.1 `LevelRenderer.levelEvent` 2007（瞬间效果药水，治疗药水就是这种）：
// - 8 个物品碎片粒子（`ItemParticle`：喷溅药水贴图里随机一块 1/4 见方的碎片），初速度 (高斯×0.15, 随机×0.2, 高斯×0.15) 格/刻，受重力；
// - 100 个 instant_effect 粒子（`SpellParticle`，贴图 spell_7 → spell_0 逐帧变小），颜色 = 药水颜色 × (0.75～1)，从落点周围 0.4 格内、高 0.3 格处向四周散开（速度乘 0～4 的 power），每刻速度乘 0.96、慢慢上飘，寿命 8～40 刻。
// 贴图照抄 client jar（npm run 取材 -- 药水）。和游戏不同的两处：粒子画大 1.4 倍（参考视频里游戏尺寸看不见）；颜色往白里掺一半（`lighten`，默认 0.5）：治疗药水是正红，一团红点糊在生物身上会被视频模型当成血（用户 09-30 定：不要血、不要红）。
// 粒子是始终朝向镜头的贴片，不受光。sec = 砸中以后经过的秒数（< 0 不显示），1 秒 20 刻。出生参数和逐刻位置在纯模块 药水炸开粒子.ts，这里只管贴图、材质。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '../../engine/core/坐标.ts';
import { pngDir } from '../../engine/model/贴图.ts';
import { POTION_TEX } from '../物品/喷溅药水.tsx';
import { assetDir } from '../../engine/core/资产目录.ts';
import effect0Png from 'asset:贴图/特效/药水粒子/effect_0';
import effect1Png from 'asset:贴图/特效/药水粒子/effect_1';
import effect2Png from 'asset:贴图/特效/药水粒子/effect_2';
import effect3Png from 'asset:贴图/特效/药水粒子/effect_3';
import effect4Png from 'asset:贴图/特效/药水粒子/effect_4';
import effect5Png from 'asset:贴图/特效/药水粒子/effect_5';
import effect6Png from 'asset:贴图/特效/药水粒子/effect_6';
import effect7Png from 'asset:贴图/特效/药水粒子/effect_7';
import spell0Png from 'asset:贴图/特效/药水粒子/spell_0';
import spell1Png from 'asset:贴图/特效/药水粒子/spell_1';
import spell2Png from 'asset:贴图/特效/药水粒子/spell_2';
import spell3Png from 'asset:贴图/特效/药水粒子/spell_3';
import spell4Png from 'asset:贴图/特效/药水粒子/spell_4';
import spell5Png from 'asset:贴图/特效/药水粒子/spell_5';
import spell6Png from 'asset:贴图/特效/药水粒子/spell_6';
import spell7Png from 'asset:贴图/特效/药水粒子/spell_7';
import { potionSplashAt, potionSplashSpawns } from './药水炸开粒子.ts';

const spellPngs = pngDir(assetDir({ './effect_0.png': effect0Png, './effect_1.png': effect1Png, './effect_2.png': effect2Png, './effect_3.png': effect3Png, './effect_4.png': effect4Png, './effect_5.png': effect5Png, './effect_6.png': effect6Png, './effect_7.png': effect7Png, './spell_0.png': spell0Png, './spell_1.png': spell1Png, './spell_2.png': spell2Png, './spell_3.png': spell3Png, './spell_4.png': spell4Png, './spell_5.png': spell5Png, './spell_6.png': spell6Png, './spell_7.png': spell7Png }));

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

// at：砸中的位置（游戏里 `Vec3.atBottomCenterOf(pos)`，这里直接给落点）；color：药水颜色；up：场景里的"上"（默认 Z），粒子的上飘、重力沿它
// count：效果粒子的个数（游戏里 100；几瓶砸在同一处时可以减少，免得糊住目标）
export const PotionSplash: React.FC<{ at: V3; sec: number; seed: number; color: string; lighten?: number; count?: number }> = ({ at, sec, seed, color, lighten = 0.5, count = 100 }) => {
  const spawns = useMemo(() => potionSplashSpawns(at, seed, count), [at[0], at[1], at[2], seed, count]);
  const spellColors = useMemo(() => {
    const base = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), lighten);
    return spawns.spells.map((spell) => base.clone().multiplyScalar(spell.shade));
  }, [spawns, color, lighten]);
  if (sec < 0) return null;
  const { spells, chips } = potionSplashAt(spawns, sec * 20);
  const out: React.ReactNode[] = [];
  for (const spell of spells) out.push(<sprite key={`s${spell.index}`} position={spell.pos} scale={[spell.size, spell.size, 1]} material={spellMat(`spell_${spell.frame}`, spellColors[spell.index])} />);
  for (const chip of chips) {
    const { uo, vo } = spawns.chips[chip.index];
    out.push(<sprite key={`c${chip.index}`} position={chip.pos} scale={[chip.size, chip.size, 1]} material={chipMat(uo, vo, color)} />);
  }
  return <>{out}</>;
};
