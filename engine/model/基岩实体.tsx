// 基岩实体：基岩版几何（基岩模型.tsx 的 BedrockModelView）+ 实体材质（实体材质.ts）+ 基岩动画（engine/anim/基岩动画.ts）拼成一个组件。
// 新做的 GeckoLib / YSM / Blockbench 生物用它（一般经 库/生物/定义生物.ts 声明）；已有的角色（魔法酒狐.tsx 等）照旧，不迁过来。
// 发光骨骼（默认名字以 ysmGlow 开头，TLM 的 GeoBone.glow）只给这根骨骼自己的方块满亮度、不往子骨骼传，做法同 魔法酒狐.tsx：
// 模型拆成主体、发光两份，各画一个 BedrockModelView、共用一张姿势表，提交后把里面的 mesh 换成对应材质。
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { 动画权重, 取样动画, 混合层, 默认口径, type 口径, type 基岩动画, type 混合模式, type 骨骼表 } from '../anim/基岩动画.ts';
import type { Molang环境 } from '../anim/Molang.ts';
import type { 控制器播放器 } from '../anim/动画控制器.ts';
import { type BedrockBone, type BedrockModel, BedrockModelView, type BonePose } from './基岩模型.tsx';
import { 实体材质, 持有实体贴图, type 实体光照 } from './实体材质.ts';
import { entityTexture } from './贴图方盒.tsx';

export const 默认发光骨骼 = (名: string) => 名.startsWith('ysmGlow');

type 拆分 = { 主体: BedrockModel; 发光: BedrockModel | null };
const 拆分缓存 = new WeakMap<BedrockModel, WeakMap<(名: string) => boolean, 拆分>>();
/** 模型拆成主体（去掉发光骨骼的方块）和发光（只留发光骨骼的方块，加上祖先骨骼让变换对）；没有发光方块时 发光 是 null */
export const 按发光拆分 = (模型: BedrockModel, 是发光: (名: string) => boolean = 默认发光骨骼): 拆分 => {
  const 表 = 拆分缓存.get(模型) ?? new WeakMap();
  拆分缓存.set(模型, 表);
  const 已有 = 表.get(是发光);
  if (已有) return 已有;
  const 父 = new Map(模型.bones.map((b) => [b.name, b.parent]));
  const 留 = new Set<string>();
  for (const b of 模型.bones) {
    if (!是发光(b.name) || !b.cubes?.length) continue;
    for (let n: string | undefined = b.name; n && !留.has(n); n = 父.get(n)) 留.add(n);
  }
  const 结果 = 留.size
    ? {
        主体: { ...模型, bones: 模型.bones.map((b) => (是发光(b.name) ? { ...b, cubes: undefined } : b)) },
        发光: { ...模型, bones: 模型.bones.filter((b) => 留.has(b.name)).map((b): BedrockBone => (是发光(b.name) ? b : { ...b, cubes: undefined })) },
      }
    : { 主体: 模型, 发光: null };
  表.set(是发光, 结果);
  return 结果;
};

/**
 * 一层动画：动画名，或一个控制器（engine/anim/动画控制器.ts，自己决定这一刻播哪段、怎么过渡）；
 * 这层自己的时钟（秒，不给用组件的 秒）、混合模式和权重（见 混合层）
 */
export type 动画层设定 =
  | { 名: string; 秒?: number; 模式?: 混合模式; 权重?: number }
  | { 控制器: 控制器播放器; 秒?: number; 模式?: 混合模式; 权重?: number };
export type 动画设定 = {
  文件: Readonly<Record<string, 基岩动画>>;
  层们: readonly 动画层设定[];
  /** Molang 环境（查询、变量表、模组命名空间）；q.anim_time 由播放器填 */
  环境?: Molang环境;
  口径?: 口径;
};

/**
 * 按控制器顺序取样各层、混合成一张骨骼表；文件里没有的动画名直接报错（拼写错不静默）。
 * 环境：q.life_time 不给时按 秒 算；没给变量表时这一帧用一张新表（各层的 v.x = … 照顺序写进去、后面的层读得到，不跨帧）。
 * '通用' 口径下层的权重再乘动画文件的 blend_weight（TLM 不读它）
 */
export const 动画姿势 = (动画: 动画设定, 秒: number): 骨骼表 => {
  const 口 = 动画.口径 ?? 默认口径;
  const 原 = 动画.环境 ?? {};
  const 环境 = { ...原, 查询: { life_time: 秒, ...原.查询 }, 变量: 原.变量 ?? {} };
  return 混合层(
    动画.层们.map((层) => {
      if ('控制器' in 层) return { 骨骼: 层.控制器.姿势(层.秒 ?? 秒, 环境), 模式: 层.模式, 权重: 层.权重 };
      const a = 动画.文件[层.名];
      if (!a) throw new Error(`基岩实体：动画文件里没有 ${层.名}`);
      const 权重 = 口 === '通用' && a.混合权重 !== undefined ? (层.权重 ?? 1) * 动画权重(a, 环境) : 层.权重;
      return { 骨骼: 取样动画(a, 层.秒 ?? 秒, { 环境, 口径: 口 }).骨骼, 模式: 层.模式, 权重 };
    }),
    口,
  );
};

export type 基岩实体属性 = {
  模型: BedrockModel;
  /** 一像素是多少格，默认 1/16 */
  缩放?: number;
  动画?: 动画设定;
  /** 动画的时钟（秒） */
  秒?: number;
  /** 叠在动画上面的骨骼姿势，按通道覆盖（镜头里手摆的看向、表情） */
  姿势?: Record<string, BonePose>;
  受伤?: number;
  光照?: 实体光照;
  透明度?: number;
  /** 发光开关（默认开）和哪些骨骼算发光 */
  发光?: boolean;
  发光骨骼?: (名: string) => boolean;
  挂载?: Record<string, React.ReactNode>;
};

/**
 * 把 根 下面这份模型自己的 mesh（原材质的贴图是 贴图 的）换成 取 给的材质。
 * 挂载进来的东西（手里的物品、别的模型）贴图不一样，不动：它们有自己的材质，有的根本没有贴图
 */
export const 换模型材质 = (根: THREE.Object3D, 贴图: THREE.Texture, 取: () => THREE.Material) => {
  根.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const 原 = (mesh.userData.原材质 ?? mesh.material) as THREE.MeshStandardMaterial;
    if (原.map !== 贴图) return;
    mesh.userData.原材质 = 原;
    mesh.material = 取();
  });
};

// 套住一份模型：每次提交后换材质（显隐一变会挂上新 mesh，所以不写依赖、每次都跑；结果一样）
const 换材质: React.FC<{ 贴图: THREE.Texture; 取: () => THREE.Material; children: React.ReactNode }> = ({ 贴图, 取, children }) => {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (ref.current) 换模型材质(ref.current, 贴图, 取);
  });
  return <group ref={ref}>{children}</group>;
};

export const 基岩实体: React.FC<基岩实体属性> = ({
  模型, 缩放 = 1 / 16, 动画, 秒 = 0, 姿势, 受伤 = 0, 光照 = '场景', 透明度 = 1, 发光 = true, 发光骨骼 = 默认发光骨骼, 挂载,
}) => {
  const { 主体, 发光: 发光份 } = useMemo(() => 按发光拆分(模型, 发光骨骼), [模型, 发光骨骼]);
  const 动画骨骼 = 动画 ? 动画姿势(动画, 秒) : {};
  // 姿势按通道盖在动画上：TLM 口径的覆盖层就是逐字段盖（库/角色/骨骼表.ts 的 合并骨骼表 同义，engine 不能 import 库）
  const pose: Record<string, BonePose> = 混合层([{ 骨骼: 动画骨骼 }, { 骨骼: 姿势 ?? {} }], 'TLM');
  // 基岩模型.tsx 的材质贴图就是这张（entityTexture 按像素对象缓存，主体、发光两份共用）
  const 贴图 = entityTexture(模型.texture);
  // 卸载、换贴图时放手，这张贴图没人用了就释放它的材质（实体材质.ts）
  useEffect(() => 持有实体贴图(贴图), [贴图]);
  return (
    <>
      <换材质 贴图={贴图} 取={() => 实体材质(贴图, { 受伤, 光照, 透明度 })}>
        <BedrockModelView model={主体} scale={缩放} pose={pose} attach={挂载} />
      </换材质>
      {发光份 && (
        <换材质 贴图={贴图} 取={() => 实体材质(贴图, 发光 ? { 发光: true, 受伤, 透明度 } : { 受伤, 光照, 透明度 })}>
          <BedrockModelView model={发光份} scale={缩放} pose={pose} />
        </换材质>
      )}
    </>
  );
};
