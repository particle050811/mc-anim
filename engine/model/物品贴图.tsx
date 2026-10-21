// 物品贴图：原版 item/generated 的做法——把一张物品贴图挤出成 1 像素厚的薄片（正反两面整张贴图，镂空像素的边上补侧面），
// 长矛、药水、权杖、巫妖护盾都是这种物品。多层贴图（药水的瓶身 + 染色的药液、护盾的框 + 半透明填充）先按层叠好再挤出，
// 和游戏里几层叠在同一个平面上画出来的样子一样。
// 坐标（物品空间，单位格）：贴图正面朝 +Z，贴图上方 = +Y，右 = +X；整张贴图占 -0.5～0.5（游戏里的 0～1 方块减去中心），厚 1/16。
// 游戏里物品的显示变换（模型 json 的 display：拿在手上、掉在地上）用 ItemDisplay 套在外面，数值照抄模型 json。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rad } from '../anim/anim.ts';
import type { Png } from './贴图.ts';

export type ItemLayer = { tex: Png; tint?: string }; // tint：染色（游戏里 tintindex 对应的颜色，药水颜色）

// 按层合成（后一层盖在前一层上，染色是乘上去的）
const composite = (layers: ItemLayer[]): Png => {
  const { w: width, h: height } = layers[0].tex;
  const out = new Uint8Array(width * height * 4);
  for (const layer of layers) {
    if (layer.tex.w !== width || layer.tex.h !== height) throw new Error('物品各层贴图尺寸不一致');
    const tintColor = layer.tint ? new THREE.Color(layer.tint) : null;
    // 染色在 sRGB 数值上乘（游戏里顶点色就是这样乘的）
    const t = tintColor ? [tintColor.r, tintColor.g, tintColor.b].map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)) : [1, 1, 1];
    for (let i = 0; i < width * height; i++) {
      const alpha = layer.tex.px[i * 4 + 3] / 255;
      if (alpha === 0) continue;
      const oa = out[i * 4 + 3] / 255;
      const na = alpha + oa * (1 - alpha);
      for (let k = 0; k < 3; k++) {
        const src = layer.tex.px[i * 4 + k] * t[k];
        out[i * 4 + k] = Math.round((src * alpha + out[i * 4 + k] * oa * (1 - alpha)) / na);
      }
      out[i * 4 + 3] = Math.round(na * 255);
    }
  }
  return { w: width, h: height, px: out };
};

const build = (img: Png) => {
  const { w: width, h: height, px } = img;
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && px[(y * width + x) * 4 + 3] > 0;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const halfThick = 1 / 32;
  const quad = (corners: number[][], normal: number[], uvs: number[][]) => {
    const baseIdx = pos.length / 3;
    corners.forEach((corner, i) => {
      pos.push(...corner);
      nor.push(...normal);
      uv.push(...uvs[i]);
    });
    idx.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
  };
  const toItemX = (x: number) => x / width - 0.5;
  const toItemY = (y: number) => 0.5 - y / height;
  quad([[-0.5, -0.5, halfThick], [0.5, -0.5, halfThick], [0.5, 0.5, halfThick], [-0.5, 0.5, halfThick]], [0, 0, 1], [[0, 1], [1, 1], [1, 0], [0, 0]]);
  quad([[0.5, -0.5, -halfThick], [-0.5, -0.5, -halfThick], [-0.5, 0.5, -halfThick], [0.5, 0.5, -halfThick]], [0, 0, -1], [[1, 1], [0, 1], [0, 0], [1, 0]]);
  // 侧面：每个不透明像素和透明邻居之间补一条 1 像素宽的面，颜色取这个像素
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      const cu = (x + 0.5) / width;
      const cv = (y + 0.5) / height;
      const t = [[cu, cv], [cu, cv], [cu, cv], [cu, cv]];
      if (!opaque(x, y - 1)) quad([[toItemX(x), toItemY(y), -halfThick], [toItemX(x + 1), toItemY(y), -halfThick], [toItemX(x + 1), toItemY(y), halfThick], [toItemX(x), toItemY(y), halfThick]].reverse(), [0, 1, 0], t);
      if (!opaque(x, y + 1)) quad([[toItemX(x), toItemY(y + 1), -halfThick], [toItemX(x + 1), toItemY(y + 1), -halfThick], [toItemX(x + 1), toItemY(y + 1), halfThick], [toItemX(x), toItemY(y + 1), halfThick]], [0, -1, 0], t);
      if (!opaque(x - 1, y)) quad([[toItemX(x), toItemY(y + 1), -halfThick], [toItemX(x), toItemY(y + 1), halfThick], [toItemX(x), toItemY(y), halfThick], [toItemX(x), toItemY(y), -halfThick]], [-1, 0, 0], t);
      if (!opaque(x + 1, y)) quad([[toItemX(x + 1), toItemY(y + 1), -halfThick], [toItemX(x + 1), toItemY(y + 1), halfThick], [toItemX(x + 1), toItemY(y), halfThick], [toItemX(x + 1), toItemY(y), -halfThick]].reverse(), [1, 0, 0], t);
    }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geom.setIndex(idx);
  const tex = new THREE.DataTexture(img.px, width, height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return { g: geom, tex };
};

const cache = new Map<string, { g: THREE.BufferGeometry; tex: THREE.DataTexture; translucent: boolean }>();
// 缓存键要按整张贴图的像素算：只取头尾字节时，16×16 物品贴图这两处多半是透明像素，不同的图会撞成同一个键、画出来全是第一张
const hashPx = (px: Uint8Array) => {
  let hash = 2166136261;
  for (let i = 0; i < px.length; i++) hash = Math.imul(hash ^ px[i], 16777619);
  return (hash >>> 0).toString(36);
};
const key = (layers: ItemLayer[]) => layers.map((l) => `${l.tex.w}x${l.tex.h}:${hashPx(l.tex.px)}|${l.tint ?? ''}`).join('+');
// 挤出的几何和贴图（给要自己配材质的物品用：第 7 章的附魔光效）
export const itemMesh = (layers: ItemLayer[]) => {
  const k = key(layers);
  let entry = cache.get(k);
  if (!entry) {
    const img = composite(layers);
    let translucent = false;
    for (let i = 3; i < img.px.length; i += 4) if (img.px[i] > 0 && img.px[i] < 255) translucent = true;
    entry = { ...build(img), translucent };
    cache.set(k, entry);
  }
  return entry;
};

// 挤出的物品。emissive：自发光打底（不受光的特效物品用）；opacity：整体淡出
export const ItemSprite: React.FC<{ layers: ItemLayer[]; emissive?: number; opacity?: number; shadow?: boolean }> = ({ layers, emissive = 0.25, opacity = 1, shadow = true }) => {
  const { g: geom, tex, translucent } = itemMesh(layers);
  const mat = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.8,
      alphaTest: translucent ? 0.02 : 0.5,
      transparent: translucent || opacity < 1,
      opacity,
      depthWrite: !translucent && opacity >= 1,
      side: THREE.DoubleSide,
      emissive: '#ffffff',
      emissiveMap: tex,
      emissiveIntensity: emissive,
    });
    return material;
  }, [tex, translucent, opacity, emissive]);
  return <mesh geometry={geom} material={mat} castShadow={shadow && !translucent} receiveShadow />;
};

// 模型 json 里的 display 变换（rotation 度、translation 像素、scale），作用在物品空间（中心在原点）上：
// 游戏里是 平移 → 按 X·Y·Z 转 → 缩放 → 再移回方块角；中心在原点时就是 平移 · 旋转 · 缩放。左手时 x 平移、y/z 旋转取反
export type ItemTransform = { rotation?: number[]; translation?: number[]; scale?: number[] };
export const ItemDisplay: React.FC<{ t: ItemTransform; left?: boolean; children: React.ReactNode }> = ({ t, left, children }) => {
  const [rx, ry, rz] = t.rotation ?? [0, 0, 0];
  const [tx, ty, tz] = t.translation ?? [0, 0, 0];
  const scale = t.scale ?? [1, 1, 1];
  return (
    <group position={[((left ? -1 : 1) * tx) / 16, ty / 16, tz / 16]}>
      <group rotation={[rad(rx), rad(left ? -ry : ry), rad(left ? -rz : rz), 'XYZ']}>
        <group scale={scale as [number, number, number]}>{children}</group>
      </group>
    </group>
  );
};

// 原版模型 json 里的 display（1.20.1 client jar：item/generated.json、item/handheld.json；1.21.11 的 item/spear_in_hand.json）
export const DISPLAY = {
  generated: {
    ground: { rotation: [0, 0, 0], translation: [0, 2, 0], scale: [0.5, 0.5, 0.5] },
    thirdperson_righthand: { rotation: [0, 0, 0], translation: [0, 3, 1], scale: [0.55, 0.55, 0.55] },
    fixed: { rotation: [0, 180, 0], scale: [1, 1, 1] },
  },
  handheld: {
    thirdperson_righthand: { rotation: [0, -90, 55], translation: [0, 4, 0.5], scale: [0.85, 0.85, 0.85] },
    thirdperson_lefthand: { rotation: [0, 90, -55], translation: [0, 4, 0.5], scale: [0.85, 0.85, 0.85] },
  },
  spear_in_hand: {
    thirdperson_righthand: { rotation: [5, 270, -40], translation: [0, 2, 2], scale: [1.7, 1.7, 0.85] },
    thirdperson_lefthand: { rotation: [5, -270, 40], translation: [0, 2, 2], scale: [1.7, 1.7, 0.85] },
  },
} satisfies Record<string, Record<string, ItemTransform>>;

// 生物手里拿的东西：照 ItemInHandLayer（1.20.1）——在手臂部件的坐标系里（格）先绕 X 转 -90°、绕 Y 转 180°，
// 再平移 (±1/16, 2/16, -10/16)，然后套物品的 thirdperson 显示变换。挂到 实体模型.tsx 的 attach 上时外面要乘 16（部件坐标是像素）
export const HeldItem: React.FC<{ t: ItemTransform; left?: boolean; children: React.ReactNode }> = ({ t, left, children }) => (
  <group scale={16}>
    <group rotation={[rad(-90), rad(180), 0, 'XYZ']}>
      <group position={[(left ? -1 : 1) / 16, 0.125, -0.625]}>
        <ItemDisplay t={t} left={left}>
          {children}
        </ItemDisplay>
      </group>
    </group>
  </group>
);
