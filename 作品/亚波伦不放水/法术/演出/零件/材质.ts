// 法术零件共用的贴图和材质：照游戏几种渲染类型的混合方式，不受场景光（法术的东西在游戏里大多是满亮度）。
// 颜色是乘在贴图上的系数（游戏的顶点色）；贴图第一行对应 v = 0（同游戏，不翻转）。
import * as THREE from 'three';
import type { Png } from '@engine/model/贴图.ts';

/**
 * 镂空：alpha < 0.1 丢掉，其余不透明、写深度（entityCutoutNoCull、粒子 PARTICLE_SHEET_OPAQUE）；
 * 半透明：普通 alpha 混合，默认不写深度（entityTranslucent、PARTICLE_SHEET_TRANSLUCENT）；
 * 加色：画面 += 颜色 × alpha，不写深度（eyes、lightning、Goety 的 PARTICLE_ADDITIVE、wraith）
 */
export type 混合 = '镂空' | '半透明' | '加色';

export type 色 = readonly [number, number, number];
/** 0xRRGGBB → 0～1 的三个分量（同 Goety 的 ColorUtil） */
export const 十六进制色 = (hex: number): 色 => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

const 贴图缓存 = new WeakMap<Png, Map<string, THREE.DataTexture>>();
/** 重复：v、u 超出 0～1 时平铺（束的贴图滚动用）；线性：线性过滤（默认最近邻，同游戏） */
export const 贴图 = (图: Png, 选: { 重复?: boolean; 线性?: boolean } = {}): THREE.DataTexture => {
  const 键 = `${选.重复 ? 1 : 0}${选.线性 ? 1 : 0}`;
  let 表 = 贴图缓存.get(图);
  if (!表) 贴图缓存.set(图, (表 = new Map()));
  let t = 表.get(键);
  if (!t) {
    t = new THREE.DataTexture(图.px, 图.w, 图.h, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = 选.线性 ? THREE.LinearFilter : THREE.NearestFilter;
    t.minFilter = 选.线性 ? THREE.LinearFilter : THREE.NearestFilter;
    if (选.重复) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    表.set(键, t);
  }
  return t;
};

export type 面材质选项 = { 混合?: 混合; 色?: 色; 透明度?: number; 重复?: boolean; 写深度?: boolean; 线性?: boolean };

/** 把混合方式落到 three 的材质参数上（面片的 ShaderMaterial 也用） */
export const 混合参数 = (混合: 混合, 写深度?: boolean) => ({
  transparent: 混合 !== '镂空',
  depthWrite: 写深度 ?? 混合 === '镂空',
  blending: 混合 === '加色' ? THREE.AdditiveBlending : THREE.NormalBlending,
});

const 材质缓存 = new Map<string, THREE.MeshBasicMaterial>();
/** 图给 null = 纯色（电弧这种没有贴图的）。同样参数拿到同一个材质，每帧调不会越建越多；透明度量到 1/256 */
export const 面材质 = (图: Png | null, 选: 面材质选项 = {}): THREE.MeshBasicMaterial => {
  const 混合 = 选.混合 ?? '半透明';
  const 色 = 选.色 ?? [1, 1, 1];
  const 透明度 = Math.round((选.透明度 ?? 1) * 256) / 256;
  const map = 图 ? 贴图(图, { 重复: 选.重复, 线性: 选.线性 }) : null;
  const 键 = `${map?.uuid ?? '纯色'}|${混合}|${色.map((c) => c.toFixed(3)).join(',')}|${透明度}|${选.写深度 ?? ''}`;
  let m = 材质缓存.get(键);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map,
      color: new THREE.Color().setRGB(色[0], 色[1], 色[2], THREE.SRGBColorSpace),
      opacity: 透明度,
      alphaTest: 混合 === '镂空' ? 0.1 : 0.004,
      side: THREE.DoubleSide,
      ...混合参数(混合, 选.写深度),
    });
    材质缓存.set(键, m);
  }
  return m;
};
