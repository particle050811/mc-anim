// 实体材质：原版实体渲染的四样效果，按选项挑一个（同选项共用一份材质）。给 基岩实体.tsx 用，以后 Java 实体模型也可以换过来。
// - 受伤变红：原版 OverlayTexture，贴图颜色（sRGB 数值）往纯红拉 1 − 0xB2/255（见 贴图方盒.tsx 的 HURT_OVERLAY），这里 0～1 按比例给。
// - 光照 '场景'：MeshStandardMaterial 受场景灯光（和 基岩模型.tsx 自带的材质一样：roughness 0.9、镂空 0.5、双面）。
// - 光照 数：原版实体光照 minecraft_mix_light（两盏固定方向光，在 sRGB 数值上乘）× 亮度图亮度（1 = 满亮度 / 夜视），不受场景光。
// - 发光：满亮度、不受光、不过色调映射，画出来就是贴图原色（TLM 的 ysmGlow 骨骼、原版 eyes 层）。
// - 透明度 < 1：半透明、不写深度（原版 entity_translucent）。
// 着色器和 实体模型.tsx 的 mcMaterial、魔法酒狐.tsx 的发光材质同一套算法；那两处迁移期不动（改了已有段的指纹会变），以后统一到这里（docs/待办.md）。
import * as THREE from 'three';

export type 实体光照 = '场景' | number;
export type 实体材质选项 = {
  /** 0～1，原版只有满（受伤后 10 刻、死后）和无两档 */
  受伤?: number;
  /** '场景'（默认）= 受场景灯光；数 = 原版实体光照，亮度 0～1 */
  光照?: 实体光照;
  /** 满亮度、不受光；给了就不看 光照 */
  发光?: boolean;
  /** 1（默认）= 镂空不透明；< 1 半透明 */
  透明度?: number;
  /** 贴图 alpha 低于它的像素镂空；默认场景光 0.5（同 基岩模型.tsx）、原版光照和发光 0.1（同原版着色器） */
  镂空?: number;
};

const 受伤比例 = 1 - 0xb2 / 255;
const MC_LIGHT0 = new THREE.Vector3(0.2, 1, -0.7).normalize();
const MC_LIGHT1 = new THREE.Vector3(-0.2, 1, 0.7).normalize();

// 片元着色器里：受伤在 sRGB 数值上往纯红拉，原版光照也在 sRGB 数值上乘（线性空间里乘的话深色贴图偏暗）
const 注入 = (mat: THREE.Material, uniforms: Record<string, { value: unknown }>, 原版光照: boolean, 程序名: string) => {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    if (原版光照) {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMcNormal;')
        .replace('#include <begin_vertex>', 'vMcNormal = normalize( mat3( modelMatrix ) * normal );\n#include <begin_vertex>');
    }
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float mcHurt;\n${原版光照 ? 'varying vec3 vMcNormal;\nuniform vec3 mcLight0;\nuniform vec3 mcLight1;\nuniform float mcBright;' : ''}`,
      )
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n  diffuseColor.rgb = sRGBTransferEOTF( vec4( mix( sRGBTransferOETF( vec4( diffuseColor.rgb, 1.0 ) ).rgb, vec3( 1.0, 0.0, 0.0 ), mcHurt ), 1.0 ) ).rgb;',
      );
    if (原版光照) {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <opaque_fragment>',
        [
          'vec3 mcN = normalize( vMcNormal );',
          'float mcShade = min( 1.0, ( max( 0.0, dot( mcLight0, mcN ) ) + max( 0.0, dot( mcLight1, mcN ) ) ) * 0.6 + 0.4 ) * mcBright;',
          'outgoingLight = sRGBTransferEOTF( vec4( sRGBTransferOETF( vec4( outgoingLight, 1.0 ) ).rgb * mcShade, 1.0 ) ).rgb;',
          '#include <opaque_fragment>',
        ].join('\n'),
      );
    }
  };
  // 着色器代码只分这几种，数值都走 uniform：程序共用
  mat.customProgramCacheKey = () => 程序名;
};

const 缓存 = new Map<string, THREE.Material>();
const 取整 = (x: number) => Math.round(x * 1000) / 1000;

/** 按选项取材质（同贴图、同选项返回同一个对象，可以放心每帧调） */
export const 实体材质 = (贴图: THREE.Texture, 选项: 实体材质选项 = {}): THREE.Material => {
  const 受伤 = 取整(Math.min(1, Math.max(0, 选项.受伤 ?? 0)) * 受伤比例);
  const 透明度 = 取整(选项.透明度 ?? 1);
  const 光照: 实体光照 = 选项.发光 ? 1 : (选项.光照 ?? '场景');
  const 场景光 = 光照 === '场景' && !选项.发光;
  const 镂空 = 选项.镂空 ?? (场景光 ? 0.5 : 0.1);
  const 键 = [贴图.uuid, 受伤, 透明度, 选项.发光 ? '发光' : 光照 === '场景' ? '场景' : 取整(光照), 镂空].join('|');
  let mat = 缓存.get(键);
  if (mat) return mat;
  const 透 = 透明度 < 1;
  const 共同 = { map: 贴图, alphaTest: 镂空, side: THREE.DoubleSide, transparent: 透, opacity: 透明度, depthWrite: !透 };
  const 受伤u = { mcHurt: { value: 受伤 } };
  if (场景光) {
    mat = new THREE.MeshStandardMaterial({ ...共同, roughness: 0.9 });
    if (受伤 > 0) 注入(mat, 受伤u, false, '实体-场景光-受伤');
  } else if (选项.发光) {
    mat = new THREE.MeshBasicMaterial({ ...共同, toneMapped: false });
    if (受伤 > 0) 注入(mat, 受伤u, false, '实体-发光-受伤');
  } else {
    mat = new THREE.MeshBasicMaterial(共同);
    注入(mat, { ...受伤u, mcLight0: { value: MC_LIGHT0 }, mcLight1: { value: MC_LIGHT1 }, mcBright: { value: 取整(光照 as number) } }, true, '实体-原版光照');
  }
  缓存.set(键, mat);
  return mat;
};

/** 原版实体光照的明暗系数（不含亮度图），给测试和要在 CPU 上算颜色的地方用：法线 n 已归一化 */
export const 原版实体明暗 = (n: readonly [number, number, number]): number => {
  const d = (l: THREE.Vector3) => Math.max(0, l.x * n[0] + l.y * n[1] + l.z * n[2]);
  return Math.min(1, (d(MC_LIGHT0) + d(MC_LIGHT1)) * 0.6 + 0.4);
};
