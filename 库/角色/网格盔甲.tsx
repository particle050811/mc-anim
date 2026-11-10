// 网格盔甲：模组里不用方盒、直接给顶点的盔甲模型（Forge 的 getHumanoidArmorModel 换上去的那种）要的两样——四边形网格的几何，和带附魔光泽的盔甲材质。
// 方盒盔甲（原版盔甲层）走 实体模型.tsx 的 EntityModel + glint，不用这里。
// 材质照 RenderType.armorCutoutNoCull：贴图 alpha < 0.1 镂空、两面都画，受场景光（和 EntityModel 默认材质同一组参数，穿在同一个人身上明暗一致）。
// 附魔光泽照 实体模型.tsx 的 GLINT 一节（1.20.1 的 RenderType.armorEntityGlint + rendertype_armor_entity_glint.fsh）：HumanoidArmorLayer.renderGlint 拿同一个模型再画一遍，
// 所以光泽的 uv 就是网格自己的 uv 过 TextureMat；画面 = 底色 + (光泽贴图 × 0.75)²，在 sRGB 数值上加、不受光照。这里和那边一样并进本体材质里加，不另画一遍。
import * as THREE from 'three';
import { entityTexture } from '../../engine/model/贴图方盒.tsx';
import type { Png } from '../../engine/model/贴图.ts';

/** 顶点表 → 几何。每个顶点 8 个数：x y z、u v（0～1，v 朝下）、法线 x y z；四个顶点一个四边形。坐标原样不换算（一般是模型像素，挂在 EntityModel 的 attach 上） */
export const 四边形几何 = (顶点: readonly number[]): THREE.BufferGeometry => {
  if (顶点.length % 32) throw new Error(`四边形几何：顶点表长度 ${顶点.length} 不是 32 的倍数`);
  const 数 = 顶点.length / 8;
  const 位置 = new Float32Array(数 * 3);
  const 法线 = new Float32Array(数 * 3);
  const uv = new Float32Array(数 * 2);
  const 序: number[] = [];
  for (let i = 0; i < 数; i++) {
    位置.set(顶点.slice(i * 8, i * 8 + 3), i * 3);
    uv.set(顶点.slice(i * 8 + 3, i * 8 + 5), i * 2);
    法线.set(顶点.slice(i * 8 + 5, i * 8 + 8), i * 3);
    if (i % 4 === 0) 序.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  const 几何 = new THREE.BufferGeometry();
  几何.setAttribute('position', new THREE.BufferAttribute(位置, 3));
  几何.setAttribute('normal', new THREE.BufferAttribute(法线, 3));
  几何.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  几何.setIndex(序);
  return 几何;
};

const GLINT = { speed: 0.5, strength: 0.75, scale: 0.16, rotZ: 0.17453292 };
const 光泽贴图表 = new WeakMap<Png, THREE.DataTexture>();
const 光泽贴图 = (t: Png) => {
  let tex = 光泽贴图表.get(t);
  if (!tex) {
    // 原样的 sRGB 数值（不转线性），着色器里直接当 sRGB 数值用
    tex = new THREE.DataTexture(t.px, t.w, t.h, THREE.RGBAFormat);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    光泽贴图表.set(t, tex);
  }
  return tex;
};

/**
 * 盔甲材质。光泽：enchanted_glint_entity 贴图，不给 = 没附魔。返回的 设秒 每帧调一次，给光泽滚动的时钟（游戏里所有附魔光泽按同一个系统时间滚）。
 * 每调一次出一份新材质（滚动矩阵各管各的），调用方自己 useMemo
 */
export const 盔甲材质 = (贴图: Png, 光泽?: Png): { 材质: THREE.MeshStandardMaterial; 设秒: (秒: number) => void } => {
  const 材质 = new THREE.MeshStandardMaterial({ map: entityTexture(贴图), roughness: 0.9, alphaTest: 0.1, side: THREE.DoubleSide });
  if (!光泽) return { 材质, 设秒: () => {} };
  const 矩阵 = { value: new THREE.Matrix3() };
  const 图 = { value: 光泽贴图(光泽) };
  材质.onBeforeCompile = (shader) => {
    shader.uniforms.glintMat = 矩阵;
    shader.uniforms.glintMap = 图;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat3 glintMat;\nvarying vec2 vGlintUv;')
      .replace('#include <begin_vertex>', 'vGlintUv = ( glintMat * vec3( uv, 1.0 ) ).xy;\n#include <begin_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D glintMap;\nvarying vec2 vGlintUv;')
      .replace(
        '#include <opaque_fragment>',
        [
          'vec4 glintC = texture2D( glintMap, vGlintUv );',
          `if ( glintC.a >= 0.1 ) { vec3 gc = glintC.rgb * ${GLINT.strength.toFixed(2)}; outgoingLight = sRGBTransferEOTF( vec4( sRGBTransferOETF( vec4( outgoingLight, 1.0 ) ).rgb + gc * gc, 1.0 ) ).rgb; }`,
          '#include <opaque_fragment>',
        ].join('\n'),
      );
  };
  材质.customProgramCacheKey = () => 'mesh-armor-glint';
  const 设秒 = (秒: number) => {
    const i = Math.floor(秒 * 1000 * GLINT.speed * 8);
    const f = (i % 110000) / 110000;
    const f1 = (i % 30000) / 30000;
    const c = Math.cos(GLINT.rotZ) * GLINT.scale;
    const s = Math.sin(GLINT.rotZ) * GLINT.scale;
    // translation(−f, f1) · rotZ · scale
    矩阵.value.set(c, -s, -f, s, c, f1, 0, 0, 1);
  };
  return { 材质, 设秒 };
};
