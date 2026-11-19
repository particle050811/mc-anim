// 基岩实体：基岩版几何（基岩模型.tsx 的 BedrockModelView）+ 实体材质（实体材质.ts）+ 基岩动画（engine/anim/基岩动画.ts）拼成一个组件。
// 新做的 GeckoLib / YSM / Blockbench 生物用它（一般经 库/生物/定义生物.ts 声明）；已有的角色（魔法酒狐.tsx 等）照旧，不迁过来。
// 发光骨骼（默认名字以 ysmGlow 开头，TLM 的 GeoBone.glow）只给这根骨骼自己的方块满亮度、不往子骨骼传，做法同 魔法酒狐.tsx：
// 模型拆成主体、发光两份，各画一个 BedrockModelView、共用一张姿势表，提交后把里面的 mesh 换成对应材质。
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { animWeight, sampleAnim, blendLayers, defaultProfile, type Convention, type BedrockAnimation, type BlendMode, type SkeletonTable } from '../anim/基岩动画.ts';
import type { MolangEnv } from '../anim/Molang.ts';
import type { ControllerPlayer } from '../anim/动画控制器.ts';
import { type BedrockBone, type BedrockModel, BedrockModelView, type BonePose } from './基岩模型.tsx';
import { entityMaterial, holdEntityTexture, type EntityLighting } from './实体材质.ts';
import { entityTexture } from './贴图方盒.tsx';

export const defaultIsGlowSkeleton = (boneName: string) => boneName.startsWith('ysmGlow');

type GlowSplit = { bodyPart: BedrockModel; glowModel: BedrockModel | null };
const splitCache = new WeakMap<BedrockModel, WeakMap<(boneName: string) => boolean, GlowSplit>>();
/** 模型拆成主体（去掉发光骨骼的方块）和发光（只留发光骨骼的方块，加上祖先骨骼让变换对）；没有发光方块时 发光 是 null */
export const splitByGlow = (bedrockModel: BedrockModel, isGlow: (boneName: string) => boolean = defaultIsGlowSkeleton): GlowSplit => {
  const splitMap = splitCache.get(bedrockModel) ?? new WeakMap();
  splitCache.set(bedrockModel, splitMap);
  const existing = splitMap.get(isGlow);
  if (existing) return existing;
  const parentOf = new Map(bedrockModel.bones.map((b) => [b.name, b.parent]));
  const kept = new Set<string>();
  for (const b of bedrockModel.bones) {
    if (!isGlow(b.name) || (!b.cubes?.length && !b.quads?.length)) continue;
    for (let n: string | undefined = b.name; n && !kept.has(n); n = parentOf.get(n)) kept.add(n);
  }
  const partition = kept.size
    ? {
        bodyPart: { ...bedrockModel, bones: bedrockModel.bones.map((b) => (isGlow(b.name) ? { ...b, cubes: undefined, quads: undefined } : b)) },
        glowModel: { ...bedrockModel, bones: bedrockModel.bones.filter((b) => kept.has(b.name)).map((b): BedrockBone => (isGlow(b.name) ? b : { ...b, cubes: undefined, quads: undefined })) },
      }
    : { bodyPart: bedrockModel, glowModel: null };
  splitMap.set(isGlow, partition);
  return partition;
};

/**
 * 一层动画：动画名，或一个控制器（engine/anim/动画控制器.ts，自己决定这一刻播哪段、怎么过渡）；
 * 这层自己的时钟（秒，不给用组件的 秒）、混合模式和权重（见 混合层）
 */
export type AnimationLayerSetting =
  | { name: string; sec?: number; blendMode?: BlendMode; weight?: number }
  | { controller: ControllerPlayer; sec?: number; blendMode?: BlendMode; weight?: number };
export type AnimationSetting = {
  file: Readonly<Record<string, BedrockAnimation>>;
  layers: readonly AnimationLayerSetting[];
  /** Molang 环境（查询、变量表、模组命名空间）；q.anim_time 由播放器填 */
  env?: MolangEnv;
  口径?: Convention;
};

/**
 * 按控制器顺序取样各层、混合成一张骨骼表；文件里没有的动画名直接报错（拼写错不静默）。
 * 环境：q.life_time 不给时按 秒 算；没给变量表时这一帧用一张新表（各层的 v.x = … 照顺序写进去、后面的层读得到，不跨帧）。
 * '通用' 口径下层的权重再乘动画文件的 blend_weight（TLM 不读它）
 */
export const animationPose = (animSpec: AnimationSetting, sec: number): SkeletonTable => {
  const convention = animSpec.口径 ?? defaultProfile;
  const baseEnv = animSpec.env ?? {};
  const env = { ...baseEnv, query: { life_time: sec, ...baseEnv.query }, 变量: baseEnv.变量 ?? {} };
  return blendLayers(
    animSpec.layers.map((animLayer) => {
      if ('controller' in animLayer) return { skeleton: animLayer.controller.poseAt(animLayer.sec ?? sec, env), blendMode: animLayer.blendMode, weight: animLayer.weight };
      const a = animSpec.file[animLayer.name];
      if (!a) throw new Error(`基岩实体：动画文件里没有 ${animLayer.name}`);
      const weight = convention === '通用' && a.blendWeight !== undefined ? (animLayer.weight ?? 1) * animWeight(a, env) : animLayer.weight;
      return { skeleton: sampleAnim(a, animLayer.sec ?? sec, { env: env, 口径: convention }).skeleton, blendMode: animLayer.blendMode, weight };
    }),
    convention,
  );
};

export type BedrockEntityProps = {
  model: BedrockModel;
  /** 一像素是多少格，默认 1/16 */
  scale?: number;
  animation?: AnimationSetting;
  /** 动画的时钟（秒） */
  sec?: number;
  /** 叠在动画上面的骨骼姿势，按通道覆盖（镜头里手摆的看向、表情） */
  bonePose?: Record<string, BonePose>;
  hurt?: number;
  lighting?: EntityLighting;
  opacity?: number;
  /** 发光开关（默认开）和哪些骨骼算发光 */
  glow?: boolean;
  isGlowSkeleton?: (boneName: string) => boolean;
  attach?: Record<string, React.ReactNode>;
};

/**
 * 把 根 下面这份模型自己的 mesh（原材质的贴图是 贴图 的）换成 取 给的材质。
 * 挂载进来的东西（手里的物品、别的模型）贴图不一样，不动：它们有自己的材质，有的根本没有贴图
 */
export const swapModelMaterial = (root: THREE.Object3D, texture: THREE.Texture, makeMaterial: () => THREE.Material) => {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const originalMaterial = (mesh.userData.originalMaterial ?? mesh.material) as THREE.MeshStandardMaterial;
    if (originalMaterial.map !== texture) return;
    mesh.userData.originalMaterial = originalMaterial;
    mesh.material = makeMaterial();
  });
};

// 套住一份模型：每次提交后换材质（显隐一变会挂上新 mesh，所以不写依赖、每次都跑；结果一样）
const SwapMaterial: React.FC<{ 贴图: THREE.Texture; 取: () => THREE.Material; children: React.ReactNode }> = ({ 贴图: texture, 取: makeMaterial, children }) => {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (ref.current) swapModelMaterial(ref.current, texture, makeMaterial);
  });
  return <group ref={ref}>{children}</group>;
};

export const BedrockEntity: React.FC<BedrockEntityProps> = ({
  model: model, scale: scale = 1 / 16, animation: animSpec, sec: sec = 0, bonePose, hurt = 0, lighting = '场景', opacity = 1, glow = true, isGlowSkeleton = defaultIsGlowSkeleton, attach,
}) => {
  const { bodyPart, glowModel: glowPart } = useMemo(() => splitByGlow(model, isGlowSkeleton), [model, isGlowSkeleton]);
  const animSkeleton = animSpec ? animationPose(animSpec, sec) : {};
  // 姿势按通道盖在动画上：TLM 口径的覆盖层就是逐字段盖（库/角色/骨骼表.ts 的 合并骨骼表 同义，engine 不能 import 库）
  const pose: Record<string, BonePose> = blendLayers([{ skeleton: animSkeleton }, { skeleton: bonePose ?? {} }], 'TLM');
  // 基岩模型.tsx 的材质贴图就是这张（entityTexture 按像素对象缓存，主体、发光两份共用）
  const texture = entityTexture(model.texture);
  // 卸载、换贴图时放手，这张贴图没人用了就释放它的材质（实体材质.ts）
  useEffect(() => holdEntityTexture(texture), [texture]);
  return (
    <>
      <SwapMaterial 贴图={texture} 取={() => entityMaterial(texture, { hurt, lighting, opacity })}>
        <BedrockModelView model={bodyPart} scale={scale} pose={pose} attach={attach} />
      </SwapMaterial>
      {glowPart && (
        <SwapMaterial 贴图={texture} 取={() => entityMaterial(texture, glow ? { glow: true, hurt, opacity } : { hurt, lighting, opacity })}>
          <BedrockModelView model={glowPart} scale={scale} pose={pose} />
        </SwapMaterial>
      )}
    </>
  );
};
