// 法术零件共用的贴图和材质：照游戏几种渲染类型的混合方式，不受场景光（法术的东西在游戏里大多是满亮度）。
// 颜色是乘在贴图上的系数（游戏的顶点色）；贴图第一行对应 v = 0（同游戏，不翻转）。
import * as THREE from 'three';
import type { Png } from '@engine/model/贴图.ts';

/**
 * 镂空：alpha < 0.1 丢掉，其余不透明、写深度（entityCutoutNoCull、粒子 PARTICLE_SHEET_OPAQUE）；
 * 半透明：普通 alpha 混合，默认不写深度（entityTranslucent、PARTICLE_SHEET_TRANSLUCENT）；
 * 加色：画面 += 颜色 × alpha，不写深度（eyes、lightning、Goety 的 PARTICLE_ADDITIVE、wraith）
 */
export type Blend = '镂空' | '半透明' | '加色';

export type RgbColor = readonly [number, number, number];
/** 0xRRGGBB → 0～1 的三个分量（同 Goety 的 ColorUtil） */
export const hexColor = (hex: number): RgbColor => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

const textureCache = new WeakMap<Png, Map<string, THREE.DataTexture>>();
/** 重复：v、u 超出 0～1 时平铺（束的贴图滚动用）；线性：线性过滤（默认最近邻，同游戏） */
export const toTexture = (image: Png, opts: { repeat?: boolean; linear?: boolean } = {}): THREE.DataTexture => {
  const cacheKey = `${opts.repeat ? 1 : 0}${opts.linear ? 1 : 0}`;
  let textureMap = textureCache.get(image);
  if (!textureMap) textureCache.set(image, (textureMap = new Map()));
  let t = textureMap.get(cacheKey);
  if (!t) {
    t = new THREE.DataTexture(image.px, image.w, image.h, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = opts.linear ? THREE.LinearFilter : THREE.NearestFilter;
    t.minFilter = opts.linear ? THREE.LinearFilter : THREE.NearestFilter;
    if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    textureMap.set(cacheKey, t);
  }
  return t;
};

export type FaceMaterialOptions = { blend?: Blend; 色?: RgbColor; opacity?: number; repeat?: boolean; depthWrite?: boolean; linear?: boolean };

/** 把混合方式落到 three 的材质参数上（面片的 ShaderMaterial 也用） */
export const blendParams = (blend: Blend, depthWrite?: boolean) => ({
  transparent: blend !== '镂空',
  depthWrite: depthWrite ?? blend === '镂空',
  blending: blend === '加色' ? THREE.AdditiveBlending : THREE.NormalBlending,
});

const materialCache = new Map<string, THREE.MeshBasicMaterial>();
/** 图给 null = 纯色（电弧这种没有贴图的）。同样参数拿到同一个材质，每帧调不会越建越多；透明度量到 1/256 */
export const faceMaterial = (image: Png | null, opts: FaceMaterialOptions = {}): THREE.MeshBasicMaterial => {
  const blend = opts.blend ?? '半透明';
  const color = opts.色 ?? [1, 1, 1];
  const opacity = Math.round((opts.opacity ?? 1) * 256) / 256;
  const map = image ? toTexture(image, { repeat: opts.repeat, linear: opts.linear }) : null;
  const cacheKey = `${map?.uuid ?? '纯色'}|${blend}|${color.map((c) => c.toFixed(3)).join(',')}|${opacity}|${opts.depthWrite ?? ''}`;
  let m = materialCache.get(cacheKey);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map,
      color: new THREE.Color().setRGB(color[0], color[1], color[2], THREE.SRGBColorSpace),
      opacity: opacity,
      alphaTest: blend === '镂空' ? 0.1 : 0.004,
      side: THREE.DoubleSide,
      ...blendParams(blend, opts.depthWrite),
    });
    materialCache.set(cacheKey, m);
  }
  return m;
};
