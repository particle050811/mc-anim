// 定义生物：声明一只基岩版 / GeckoLib / YSM 生物（几何、贴图、外观变体、动画），得到一个组件。新做的生物用它；已有的（魔法酒狐.tsx 等）照旧。
// 外观变体：每个键列可选值（第一个是默认），贴图写成「变体 → 几层贴图（从下到上）」，按选中的值合成一张（engine/model/贴图合成.ts），
// 例：村民 群系 × 职业 × 等级 = 底图 + 职业层 + 徽章层。每种组合只合成一次。
// 动画：动画文件在定义时解析一次（Molang 能算的当场烘成数）；组件按 秒 取样各层、混合（engine/model/基岩实体.tsx 的 动画姿势）。
// 坐标同 骨架.tsx：原点在脚底，Z 朝上，朝向 +Y；pose.yaw 绕 Z 转（度）。新加一只的步骤见 docs/新生物.md。
import { createElement, type FC, type ReactNode } from 'react';
import { rad } from '../../engine/anim/anim.ts';
import type { MolangEnv } from '../../engine/anim/Molang.ts';
import { parseAnimationFile, type Convention, type BedrockAnimation } from '../../engine/anim/基岩动画.ts';
import { BedrockEntity, type AnimationLayerSetting } from '../../engine/model/基岩实体.tsx';
import type { BedrockModel, BonePose } from '../../engine/model/基岩模型.tsx';
import type { EntityLighting } from '../../engine/model/实体材质.ts';
import { png, type Png } from '../../engine/model/贴图.ts';
import { overlayTextures } from '../../engine/model/贴图合成.ts';

/** import 'asset:贴图/…' 得到的 data URI，或已经读好的 Png */
export type TextureSource = string | Png;
export type VariantTable = Readonly<Record<string, readonly string[]>>;
export type VariantPick<V extends VariantTable> = { [K in keyof V]: V[K][number] };

export type CreatureDef<V extends VariantTable> = {
  名: string;
  /** import 'asset:模型/…' 得到的基岩几何（导出模型.py 的格式：texW、texH、bones），不带贴图 */
  模型: unknown;
  /** 一张贴图；或按变体给几层（从下到上）合成一张 */
  贴图: TextureSource | ((variant: VariantPick<V>) => readonly TextureSource[]);
  variant?: V;
  /** import 'asset:动画/…' 得到的 .animation.json；默认层们 = 不另给时播哪几层（控制器顺序） */
  动画?: { 文件: unknown; defaultLayers: readonly AnimationLayerSetting[]; 口径?: Convention; 环境?: MolangEnv };
  /** 一像素是多少格，默认 1/16（再乘模组自己的渲染缩放，如 TLM 的 render_entity_scale） */
  缩放?: number;
  isGlowSkeleton?: (boneName: string) => boolean;
};

export type CreatureProps<V extends VariantTable> = {
  pose: { loc: number[]; yaw?: number };
  variant?: Partial<VariantPick<V>>;
  /** 动画时钟（秒） */
  秒?: number;
  layers?: readonly AnimationLayerSetting[];
  /** 合到定义里的环境上：查询、上下文、外部（模组命名空间如 ysm.has_helmet）按名字逐个盖，变量表给了就整张换 */
  环境?: MolangEnv;
  /** 叠在动画上面，按通道覆盖 */
  bonePose?: Record<string, BonePose>;
  hurt?: number;
  lighting?: EntityLighting;
  opacity?: number;
  glow?: boolean;
  attach?: Record<string, ReactNode>;
};

const toPng = (t: TextureSource): Png => (typeof t === 'string' ? png(t) : t);

/** 两个环境按命名空间合并（后面的盖前面的同名项）：只给 外部: { 'ysm.food_level': 5 } 不会把定义里的 ysm.has_helmet 冲掉 */
export const mergeEnv = (bottomEnv: MolangEnv = {}, override: MolangEnv = {}): MolangEnv => ({
  ...bottomEnv,
  ...override,
  query: { ...bottomEnv.query, ...override.query },
  context: { ...bottomEnv.context, ...override.context },
  external: { ...bottomEnv.external, ...override.external },
  变量: override.变量 ?? bottomEnv.变量,
});

export const defineCreature = <const V extends VariantTable = Record<never, never>>(definition: CreatureDef<V>) => {
  const animationFiles: Readonly<Record<string, BedrockAnimation>> | undefined = definition.动画 ? parseAnimationFile(definition.动画.文件, definition.动画.口径) : undefined;
  const model = definition.模型 as Omit<BedrockModel, 'texture'>;
  if (!Array.isArray(model?.bones)) throw new Error(`定义生物「${definition.名}」：模型不是基岩几何（缺 bones）`);
  const variantKeys = Object.keys(definition.variant ?? {}) as (keyof V & string)[];

  /** 补上默认值、核对取值；不认识的值报错（拼写错不静默） */
  const pickVariant = (choice: Partial<VariantPick<V>> = {}): VariantPick<V> => {
    const picked = {} as VariantPick<V>;
    for (const k of variantKeys) {
      const choices = definition.variant![k]!;
      const v = choice[k] ?? choices[0];
      if (v === undefined || !choices.includes(v)) throw new Error(`「${definition.名}」的变体 ${k} 没有 ${String(v)}（可选：${choices.join('、')}）`);
      picked[k] = v as VariantPick<V>[typeof k];
    }
    return picked;
  };

  // 同一组合返回同一个模型对象：基岩模型.tsx 按模型对象缓存几何、材质
  const modelCache = new Map<string, BedrockModel>();
  const getModel = (choice?: Partial<VariantPick<V>>): BedrockModel => {
    const variant = pickVariant(choice);
    const cacheKey = JSON.stringify(variantKeys.map((k) => variant[k]));
    let m = modelCache.get(cacheKey);
    if (!m) {
      const texture = typeof definition.贴图 === 'function' ? overlayTextures(definition.贴图(variant).map(toPng)) : toPng(definition.贴图);
      if (texture.w !== model.texW || texture.h !== model.texH) console.warn(`「${definition.名}」贴图 ${texture.w}×${texture.h} 和模型的 ${model.texW}×${model.texH} 不一样（UV 按模型的算）`);
      modelCache.set(cacheKey, (m = { ...model, texture: texture }));
    }
    return m;
  };

  const component: FC<CreatureProps<V>> = (p) =>
    createElement(
      'group',
      { position: p.pose.loc, rotation: [0, 0, rad(p.pose.yaw ?? 0)] },
      createElement(BedrockEntity, {
        模型: getModel(p.variant),
        缩放: definition.缩放,
        动画:
          animationFiles && definition.动画
            ? { 文件: animationFiles, layers: p.layers ?? definition.动画.defaultLayers, 口径: definition.动画.口径, 环境: mergeEnv(definition.动画.环境, p.环境) }
            : undefined,
        秒: p.秒,
        bonePose: p.bonePose,
        hurt: p.hurt,
        lighting: p.lighting,
        opacity: p.opacity,
        glow: p.glow,
        isGlowSkeleton: definition.isGlowSkeleton,
        attach: p.attach,
      }),
    );
  component.displayName = definition.名;
  return Object.assign(component, { definition, animationFiles, getModel, pickVariant });
};
