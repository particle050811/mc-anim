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
import type { Vec3 } from '../接口.ts';
import { blendParams, toTexture, type Blend, type RgbColor } from './材质.ts';
import { nearFadeContext } from './面片.tsx';

export type { EntityModelData, PartPose };
/** 度 → 弧度 */
export const degToRad = rad;

/** import raw from 'asset:模型/法术/goety/<类名>' 得到的 json 里取出模型（json 形如 { models: { <类名>: … } }） */
export const getModel = (raw: unknown, modelName: string): EntityModelData => {
  const model = (raw as { models?: Record<string, EntityModelData> }).models?.[modelName];
  if (!model) throw new Error(`模型 json 里没有 ${modelName}`);
  return model;
};

// 游戏坐标 → 场景坐标：x 同向，游戏的 y（上）→ 场景 z，游戏的 z（南）→ 场景 −y。是绕 X 转 +90° 的纯旋转
/** 里面用游戏坐标（x 东、y 上、z 南，单位格）。位 = 实体在场景里的位置（渲染器 render() 开始时 PoseStack 的原点就是实体位置） */
export const MinecraftSpace: React.FC<{ 位: Vec3; children: React.ReactNode }> = ({ 位: pos, children }) => (
  <group position={[pos[0], pos[1], pos[2]]} rotation={[Math.PI / 2, 0, 0]}>
    {children}
  </group>
);

/**
 * 模型的画法，对应渲染器 getBuffer 时用的 RenderType：
 * 镂空 = entityCutoutNoCull；半透明 = entityTranslucent（这两种吃实体的方向明暗和 亮度）；
 * 发光 = entityTranslucentEmissive（满亮度，仍吃方向明暗）；加色 = eyes、Goety 的 wraith（满亮度、加色、不写深度、不吃明暗）
 */
export type ModelDrawMode = '镂空' | '半透明' | '发光' | '加色';

const MC_LIGHT0 = new THREE.Vector3(0.2, 1, -0.7).normalize();
const MC_LIGHT1 = new THREE.Vector3(-0.2, 1, 0.7).normalize();
const materialCache = new Map<string, THREE.Material>();
/** 近镜淡（面片.tsx 的 近镜淡，段自己开）落到模型上：逐像素量离镜头多远，半透明、加色、发光的乘透明度，镂空的不能半透，按屏幕抖点丢像素（离得越近丢得越多） */
const nearFadeFragment = (cutout: boolean) =>
  [
    'float mcNear = smoothstep( nearFade.x, nearFade.y, vNearDist );',
    cutout ? 'if ( mcNear < fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) ) discard;' : 'diffuseColor.a *= mcNear;',
  ].join('\n');
const modelMaterial = (image: Png, drawMode: ModelDrawMode, color: RgbColor, opacity: number, brightness: number, nearFade: readonly [number, number] | null) => {
  const map = toTexture(image);
  const a = Math.round(opacity * 256) / 256;
  const quantBrightness = drawMode === '镂空' || drawMode === '半透明' ? Math.round(brightness * 256) / 256 : 1;
  const hasFade = !!nearFade && nearFade[1] > 0;
  const cacheKey = `${map.uuid}|${drawMode}|${color.map((c) => c.toFixed(3)).join(',')}|${a}|${quantBrightness}|${hasFade ? nearFade!.join(',') : ''}`;
  let m = materialCache.get(cacheKey);
  if (!m) {
    const blendMode: Blend = drawMode === '加色' ? '加色' : drawMode === '镂空' ? '镂空' : '半透明';
    const mm = new THREE.MeshBasicMaterial({
      map,
      color: new THREE.Color().setRGB(color[0], color[1], color[2], THREE.SRGBColorSpace),
      opacity: a,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      ...blendParams(blendMode),
    });
    const shaded = drawMode !== '加色';
    mm.onBeforeCompile = (shader) => {
      if (shaded) {
        // 原版实体的方向明暗（minecraft_mix_light：两盏固定方向的灯 × 0.6 + 0.4），在 sRGB 数值上乘，同 @engine/model/实体模型.tsx 的 mcMaterial。
        // 灯的方向是游戏世界坐标里的，这里的法线经 modelMatrix 到了 three 世界（场景再转一次 Y 朝上），和游戏世界同向
        shader.uniforms.mcLight0 = { value: MC_LIGHT0 };
        shader.uniforms.mcLight1 = { value: MC_LIGHT1 };
        shader.uniforms.mcBright = { value: quantBrightness };
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
      if (hasFade) {
        shader.uniforms.nearFade = { value: new THREE.Vector2(nearFade![0], nearFade![1]) };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vNearDist;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvNearDist = length( mvPosition.xyz );');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vNearDist;\nuniform vec2 nearFade;')
          .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>\n${nearFadeFragment(blendMode === '镂空')}`);
      }
    };
    mm.customProgramCacheKey = () => `法术实体${shaded ? `明暗${quantBrightness}` : ''}${hasFade ? `近淡${blendMode === '镂空' ? '抖' : '透'}` : ''}`;
    m = mm;
    materialCache.set(cacheKey, m);
  }
  return m;
};

const PartNode: React.FC<{ part: EntityPart; 模型: EntityModelData; partPoses?: Record<string, PartPose>; material: THREE.Material; onlyParts?: readonly string[] }> = ({ part, 模型: model, partPoses, material, onlyParts }) => {
  const pose = partPoses?.[part.name];
  if (pose?.hide) return null;
  const off = pose?.offset ?? part.pose.offset;
  const rot = pose?.rot ?? part.pose.rot;
  return (
    // ModelPart.translateAndRotate：平移（像素）、ZYX 旋转、再缩放
    <group position={off as [number, number, number]} rotation={[rot[0]!, rot[1]!, rot[2]!, 'ZYX']} {...(pose?.scale ? { scale: pose.scale as [number, number, number] } : {})}>
      {part.cubes.length > 0 && (!onlyParts || onlyParts.includes(part.name)) && <mesh geometry={ownPartGeometry(part, model.texSize)} material={material} frustumCulled={false} />}
      {part.children.map((child, i) => (
        <PartNode key={i} part={child} 模型={model} partPoses={partPoses} material={material} onlyParts={onlyParts} />
      ))}
    </group>
  );
};

/**
 * model.renderToBuffer：放在 MC空间（和照 PoseStack 套的 group）里面。模型单位是像素，这里除以 16（ModelPart.render 里的 /16）。
 * 色、透明度 = renderToBuffer 的 r、g、b、a；亮度 = packedLight 折成 0～1（满亮度 0xF000F0 是 1，只对 镂空、半透明 起作用）；
 * 只画 = 只画这几个部件自己的方盒（发光层只盖一部分部件时用）
 */
export const ModelPart: React.FC<{
  模型: EntityModelData;
  图: Png;
  画法?: ModelDrawMode;
  partPoses?: Record<string, PartPose>;
  色?: RgbColor;
  opacity?: number;
  brightness?: number;
  onlyParts?: readonly string[];
}> = ({ 模型: model, 图: image, 画法: drawMode = '镂空', partPoses, 色: color = [1, 1, 1], opacity = 1, brightness = 1, onlyParts }) => {
  const material = modelMaterial(image, drawMode, color, opacity, brightness, useContext(nearFadeContext));
  const scale = useMemo(() => [1 / 16, 1 / 16, 1 / 16] as const, []);
  return (
    <group scale={scale as unknown as [number, number, number]}>
      <PartNode part={model.root} 模型={model} partPoses={partPoses} material={material} onlyParts={onlyParts} />
    </group>
  );
};
