// 法术实体的模型：`anim extract 亚波伦法术模型` 从模组 Java 模型类导出的 json（资产 模型/法术/goety/<类名>）加贴图，照渲染器的 render() 摆出来。
// Goety 的弹射物渲染器不是 LivingEntityRenderer（没有那套翻转和 1.501 格的平移），每个渲染器自己往 PoseStack 上堆平移、旋转、缩放。
// 这里给一个「游戏坐标」的 group（MC空间），里面照渲染器的 PoseStack 一层层套 group 就行：
//   poseStack.translate(x, y, z)                  → <group position={[x, y, z]}>
//   poseStack.mulPose(Axis.YP.rotationDegrees(a))  → <group rotation={[0, 度(a), 0]}>（XP、ZP 同理；一层只放一个轴，照源码顺序往里套）
//   poseStack.scale(x, y, z)                       → <group scale={[x, y, z]}>
//   model.renderToBuffer(...)                      → <模型件 模型={…} 图={…} 类型=… 色=… 透明度=… />
// 模型部件的姿态（setupAnim 里改的 xRot、yRot、zRot、位置、缩放）用 姿态 传，键是部件名（见导出的 json）。
// 负的缩放（很多渲染器 scale(−1, −1, 1)）照写，three 会自己把正反面翻过来；材质两面都画。
import React, { useContext, useMemo } from 'react';
import * as THREE from 'three';
import { ownPartGeometry, type EntityModelData, type EntityPart, type PartPose } from '@engine/model/实体模型.tsx';
import type { Png } from '@engine/model/贴图.ts';
import { rad } from '@engine/core/数学.ts';
import type { 点 } from '../接口.ts';
import { 混合参数, 贴图, type 混合, type 色 } from './材质.ts';
import { 近镜淡 } from './面片.tsx';

export type { EntityModelData, PartPose };
/** 度 → 弧度 */
export const 度 = rad;

/** import raw from 'asset:模型/法术/goety/<类名>' 得到的 json 里取出模型（json 形如 { models: { <类名>: … } }） */
export const 取模型 = (raw: unknown, 名: string): EntityModelData => {
  const 模型 = (raw as { models?: Record<string, EntityModelData> }).models?.[名];
  if (!模型) throw new Error(`模型 json 里没有 ${名}`);
  return 模型;
};

// 游戏坐标 → 场景坐标：x 同向，游戏的 y（上）→ 场景 z，游戏的 z（南）→ 场景 −y。是绕 X 转 +90° 的纯旋转
/** 里面用游戏坐标（x 东、y 上、z 南，单位格）。位 = 实体在场景里的位置（渲染器 render() 开始时 PoseStack 的原点就是实体位置） */
export const MC空间: React.FC<{ 位: 点; children: React.ReactNode }> = ({ 位, children }) => (
  <group position={[位[0], 位[1], 位[2]]} rotation={[Math.PI / 2, 0, 0]}>
    {children}
  </group>
);

/**
 * 模型的画法，对应渲染器 getBuffer 时用的 RenderType：
 * 镂空 = entityCutoutNoCull；半透明 = entityTranslucent（这两种吃实体的方向明暗和 亮度）；
 * 发光 = entityTranslucentEmissive（满亮度，仍吃方向明暗）；加色 = eyes、Goety 的 wraith（满亮度、加色、不写深度、不吃明暗）
 */
export type 模型画法 = '镂空' | '半透明' | '发光' | '加色';

const MC_LIGHT0 = new THREE.Vector3(0.2, 1, -0.7).normalize();
const MC_LIGHT1 = new THREE.Vector3(-0.2, 1, 0.7).normalize();
const 材质缓存 = new Map<string, THREE.Material>();
/** 近镜淡（面片.tsx 的 近镜淡，段自己开）落到模型上：逐像素量离镜头多远，半透明、加色、发光的乘透明度，镂空的不能半透，按屏幕抖点丢像素（离得越近丢得越多） */
const 近淡片段 = (镂空: boolean) =>
  [
    'float mcNear = smoothstep( nearFade.x, nearFade.y, vNearDist );',
    镂空 ? 'if ( mcNear < fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) ) discard;' : 'diffuseColor.a *= mcNear;',
  ].join('\n');
const 模型材质 = (图: Png, 画法: 模型画法, 色: 色, 透明度: number, 亮度: number, 淡: readonly [number, number] | null) => {
  const map = 贴图(图);
  const a = Math.round(透明度 * 256) / 256;
  const 亮 = 画法 === '镂空' || 画法 === '半透明' ? Math.round(亮度 * 256) / 256 : 1;
  const 开淡 = !!淡 && 淡[1] > 0;
  const 键 = `${map.uuid}|${画法}|${色.map((c) => c.toFixed(3)).join(',')}|${a}|${亮}|${开淡 ? 淡!.join(',') : ''}`;
  let m = 材质缓存.get(键);
  if (!m) {
    const 混: 混合 = 画法 === '加色' ? '加色' : 画法 === '镂空' ? '镂空' : '半透明';
    const mm = new THREE.MeshBasicMaterial({
      map,
      color: new THREE.Color().setRGB(色[0], 色[1], 色[2], THREE.SRGBColorSpace),
      opacity: a,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      ...混合参数(混),
    });
    const 明暗 = 画法 !== '加色';
    mm.onBeforeCompile = (shader) => {
      if (明暗) {
        // 原版实体的方向明暗（minecraft_mix_light：两盏固定方向的灯 × 0.6 + 0.4），在 sRGB 数值上乘，同 @engine/model/实体模型.tsx 的 mcMaterial。
        // 灯的方向是游戏世界坐标里的，这里的法线经 modelMatrix 到了 three 世界（场景再转一次 Y 朝上），和游戏世界同向
        shader.uniforms.mcLight0 = { value: MC_LIGHT0 };
        shader.uniforms.mcLight1 = { value: MC_LIGHT1 };
        shader.uniforms.mcBright = { value: 亮 };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vMcNormal;')
          .replace('#include <begin_vertex>', 'vMcNormal = normalize( mat3( modelMatrix ) * normal );\n#include <begin_vertex>');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vMcNormal;\nuniform vec3 mcLight0;\nuniform vec3 mcLight1;\nuniform float mcBright;')
          .replace(
            '#include <opaque_fragment>',
            [
              'vec3 mcN = normalize( vMcNormal );',
              'float mcShade = min( 1.0, ( max( 0.0, dot( mcLight0, mcN ) ) + max( 0.0, dot( mcLight1, mcN ) ) ) * 0.6 + 0.4 ) * mcBright;',
              'outgoingLight = sRGBTransferEOTF( vec4( sRGBTransferOETF( vec4( outgoingLight, 1.0 ) ).rgb * mcShade, 1.0 ) ).rgb;',
              '#include <opaque_fragment>',
            ].join('\n'),
          );
      }
      if (开淡) {
        shader.uniforms.nearFade = { value: new THREE.Vector2(淡![0], 淡![1]) };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vNearDist;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvNearDist = length( mvPosition.xyz );');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vNearDist;\nuniform vec2 nearFade;')
          .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>\n${近淡片段(混 === '镂空')}`);
      }
    };
    mm.customProgramCacheKey = () => `法术实体${明暗 ? `明暗${亮}` : ''}${开淡 ? `近淡${混 === '镂空' ? '抖' : '透'}` : ''}`;
    m = mm;
    材质缓存.set(键, m);
  }
  return m;
};

const 部件: React.FC<{ 件: EntityPart; 模型: EntityModelData; 姿态?: Record<string, PartPose>; 材质: THREE.Material; 只画?: readonly string[] }> = ({ 件, 模型, 姿态, 材质, 只画 }) => {
  const 姿 = 姿态?.[件.name];
  if (姿?.hide) return null;
  const off = 姿?.offset ?? 件.pose.offset;
  const rot = 姿?.rot ?? 件.pose.rot;
  return (
    // ModelPart.translateAndRotate：平移（像素）、ZYX 旋转、再缩放
    <group position={off as [number, number, number]} rotation={[rot[0]!, rot[1]!, rot[2]!, 'ZYX']} {...(姿?.scale ? { scale: 姿.scale as [number, number, number] } : {})}>
      {件.cubes.length > 0 && (!只画 || 只画.includes(件.name)) && <mesh geometry={ownPartGeometry(件, 模型.texSize)} material={材质} frustumCulled={false} />}
      {件.children.map((子, i) => (
        <部件 key={i} 件={子} 模型={模型} 姿态={姿态} 材质={材质} 只画={只画} />
      ))}
    </group>
  );
};

/**
 * model.renderToBuffer：放在 MC空间（和照 PoseStack 套的 group）里面。模型单位是像素，这里除以 16（ModelPart.render 里的 /16）。
 * 色、透明度 = renderToBuffer 的 r、g、b、a；亮度 = packedLight 折成 0～1（满亮度 0xF000F0 是 1，只对 镂空、半透明 起作用）；
 * 只画 = 只画这几个部件自己的方盒（发光层只盖一部分部件时用）
 */
export const 模型件: React.FC<{
  模型: EntityModelData;
  图: Png;
  画法?: 模型画法;
  姿态?: Record<string, PartPose>;
  色?: 色;
  透明度?: number;
  亮度?: number;
  只画?: readonly string[];
}> = ({ 模型, 图, 画法 = '镂空', 姿态, 色 = [1, 1, 1], 透明度 = 1, 亮度 = 1, 只画 }) => {
  const 材质 = 模型材质(图, 画法, 色, 透明度, 亮度, useContext(近镜淡));
  const 缩 = useMemo(() => [1 / 16, 1 / 16, 1 / 16] as const, []);
  return (
    <group scale={缩 as unknown as [number, number, number]}>
      <部件 件={模型.root} 模型={模型} 姿态={姿态} 材质={材质} 只画={只画} />
    </group>
  );
};
