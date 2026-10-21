// 贴图方盒：按 Minecraft 实体模型的展开方式给长方体六个面贴图（和玩家皮肤的展开图同一套规则）。
// 贴图是 PNG 资产（取材配方从 jar 里取出来），用 贴图.ts 的 png() 读进来。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from './parts.tsx';
import type { Png } from './贴图.ts';

export type EntityTexture = Png;

const cache = new WeakMap<EntityTexture, THREE.DataTexture>();
export const entityTexture = (t: EntityTexture) => {
  let tex = cache.get(t);
  if (!tex) {
    tex = new THREE.DataTexture(t.px, t.w, t.h, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    cache.set(t, tex);
  }
  return tex;
};

// 原版生物受伤变红（1.20.1，客户端 jar 反汇编 / 着色器原文）：
// - `OverlayTexture` 是 16×16 的图，v < 8 的上半张每格都是 0xB20000FF = 纯红 (255,0,0)、alpha 0xB2；`LivingEntityRenderer` 取 OverlayTexture.v(hurtTime > 0 || deathTime > 0)，只有满和无两档、没有渐变。
// - rendertype_entity_cutout_no_cull.fsh：color.rgb = mix(overlay.rgb, color.rgb, overlay.a)；再乘光照图。即贴图颜色（sRGB 数值）往纯红拉约 30.2%。
// - 受伤后红 10 刻（0.5 秒）；死后一直红到移除。
// three 这边贴图采样出来是线性值，先转回 sRGB 数值按原版比例混红再转回线性（直接在线性空间混红偏淡）；混在受光之前（差别很小）。旧项目 lib/实体模型.tsx 的 `HURT_MIX` 是同一个比例但混在线性空间（6-1-5～6-1-8 已出片，没动）。
export const HURT_OVERLAY = { mix: 1 - 0xb2 / 255, ticks: 10 };
export const applyHurtOverlay = (mat: THREE.MeshStandardMaterial) => {
  const k = HURT_OVERLAY.mix.toFixed(4);
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>\n  diffuseColor.rgb = sRGBTransferEOTF(vec4(mix(sRGBTransferOETF(vec4(diffuseColor.rgb, 1.0)).rgb, vec3(1.0, 0.0, 0.0), ${k}), 1.0)).rgb;`,
    );
  };
  mat.customProgramCacheKey = () => `mc-hurt${k}`;
};

// 盒子朝向：正面朝 -Y，顶面 +Z，实体的右手边是 -X。
// px = 盒子在模型里的像素尺寸 [宽 X, 高 Z, 深 Y]，uv = 展开图左上角在贴图里的像素位置（模型代码里的 texOffs）。展开图：第一行是 顶面、底面；第二行从左到右是 右侧面、正面、左侧面、背面。
export const TexBox: React.FC<{
  tex: EntityTexture;
  px: [number, number, number];
  uv: [number, number];
  s: V3; // 实际尺寸（格）[X, Y, Z]
  p?: V3; // 盒子中心
  emissive?: number;
  alphaTest?: number;
  hurt?: boolean; // 原版受伤 / 死亡变红（见 `HURT_OVERLAY`）
}> = ({ tex, px: [width, height, depth], uv: [u0, v0], s: size, p: center = [0, 0, 0], emissive = 0, alphaTest = 0, hurt = false }) => {
  const mesh = useMemo(() => {
    const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
    const pos: number[] = [];
    const nor: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    // 一个面：左上、右上、右下、左下四个角（从外面看），对应贴图矩形 (x, y, w, h)
    const face = (corners: V3[], normal: V3, x: number, y: number, fw: number, fh: number) => {
      const baseIdx = pos.length / 3;
      corners.forEach((corner) => { pos.push(...corner); nor.push(...normal); });
      const [ua, ub, va, vb] = [x / tex.w, (x + fw) / tex.w, y / tex.h, (y + fh) / tex.h];
      uvs.push(ua, va, ub, va, ub, vb, ua, vb);
      idx.push(baseIdx, baseIdx + 2, baseIdx + 1, baseIdx, baseIdx + 3, baseIdx + 2);
    };
    const y1 = v0 + depth;
    face([[-hx, hy, hz], [-hx, -hy, hz], [-hx, -hy, -hz], [-hx, hy, -hz]], [-1, 0, 0], u0, y1, depth, height);
    face([[-hx, -hy, hz], [hx, -hy, hz], [hx, -hy, -hz], [-hx, -hy, -hz]], [0, -1, 0], u0 + depth, y1, width, height);
    face([[hx, -hy, hz], [hx, hy, hz], [hx, hy, -hz], [hx, -hy, -hz]], [1, 0, 0], u0 + depth + width, y1, depth, height);
    face([[hx, hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [hx, hy, -hz]], [0, 1, 0], u0 + depth + width + depth, y1, width, height);
    face([[-hx, hy, hz], [hx, hy, hz], [hx, -hy, hz], [-hx, -hy, hz]], [0, 0, 1], u0 + depth, v0, width, depth); // 顶面：正面在图的下边
    face([[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz]], [0, 0, -1], u0 + depth + width, v0, width, depth);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(idx);
    const map = entityTexture(tex);
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.9, alphaTest, transparent: false, side: THREE.DoubleSide });
    if (hurt) applyHurtOverlay(mat);
    if (emissive > 0) {
      mat.emissive = new THREE.Color('#ffffff');
      mat.emissiveMap = map;
      mat.emissiveIntensity = emissive;
    }
    const boxMesh = new THREE.Mesh(geom, mat);
    boxMesh.castShadow = true;
    boxMesh.receiveShadow = true;
    return boxMesh;
  }, [tex, width, height, depth, u0, v0, size[0], size[1], size[2], emissive, alphaTest, hurt]);
  return <primitive object={mesh} position={center} />;
};
