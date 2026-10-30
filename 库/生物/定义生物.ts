// 定义生物：声明一只基岩版 / GeckoLib / YSM 生物（几何、贴图、外观变体、动画），得到一个组件。新做的生物用它；已有的（魔法酒狐.tsx 等）照旧。
// 外观变体：每个键列可选值（第一个是默认），贴图写成「变体 → 几层贴图（从下到上）」，按选中的值合成一张（engine/model/贴图合成.ts），
// 例：村民 群系 × 职业 × 等级 = 底图 + 职业层 + 徽章层。每种组合只合成一次。
// 动画：动画文件在定义时解析一次（Molang 能算的当场烘成数）；组件按 秒 取样各层、混合（engine/model/基岩实体.tsx 的 动画姿势）。
// 坐标同 骨架.tsx：原点在脚底，Z 朝上，朝向 +Y；pose.yaw 绕 Z 转（度）。新加一只的步骤见 docs/新生物.md。
import { createElement, type FC, type ReactNode } from 'react';
import { rad } from '../../engine/anim/anim.ts';
import type { Molang环境 } from '../../engine/anim/Molang.ts';
import { 解析动画文件, type 口径, type 基岩动画 } from '../../engine/anim/基岩动画.ts';
import { 基岩实体, type 动画层设定 } from '../../engine/model/基岩实体.tsx';
import type { BedrockModel, BonePose } from '../../engine/model/基岩模型.tsx';
import type { 实体光照 } from '../../engine/model/实体材质.ts';
import { png, type Png } from '../../engine/model/贴图.ts';
import { 叠贴图 } from '../../engine/model/贴图合成.ts';

/** import 'asset:贴图/…' 得到的 data URI，或已经读好的 Png */
export type 贴图源 = string | Png;
export type 变体表 = Readonly<Record<string, readonly string[]>>;
export type 变体选择<V extends 变体表> = { [K in keyof V]: V[K][number] };

export type 生物定义<V extends 变体表> = {
  名: string;
  /** import 'asset:模型/…' 得到的基岩几何（导出模型.py 的格式：texW、texH、bones），不带贴图 */
  模型: unknown;
  /** 一张贴图；或按变体给几层（从下到上）合成一张 */
  贴图: 贴图源 | ((变体: 变体选择<V>) => readonly 贴图源[]);
  变体?: V;
  /** import 'asset:动画/…' 得到的 .animation.json；默认层们 = 不另给时播哪几层（控制器顺序） */
  动画?: { 文件: unknown; 默认层们: readonly 动画层设定[]; 口径?: 口径; 环境?: Molang环境 };
  /** 一像素是多少格，默认 1/16（再乘模组自己的渲染缩放，如 TLM 的 render_entity_scale） */
  缩放?: number;
  发光骨骼?: (名: string) => boolean;
};

export type 生物属性<V extends 变体表> = {
  pose: { loc: number[]; yaw?: number };
  变体?: Partial<变体选择<V>>;
  /** 动画时钟（秒） */
  秒?: number;
  层们?: readonly 动画层设定[];
  /** 合到定义里的环境上（变量表、模组命名空间如 ysm.has_helmet） */
  环境?: Molang环境;
  /** 叠在动画上面，按通道覆盖 */
  姿势?: Record<string, BonePose>;
  受伤?: number;
  光照?: 实体光照;
  透明度?: number;
  发光?: boolean;
  挂载?: Record<string, ReactNode>;
};

const 读 = (t: 贴图源): Png => (typeof t === 'string' ? png(t) : t);

export const 定义生物 = <const V extends 变体表 = Record<never, never>>(定义: 生物定义<V>) => {
  const 动画文件: Readonly<Record<string, 基岩动画>> | undefined = 定义.动画 ? 解析动画文件(定义.动画.文件) : undefined;
  const 几何 = 定义.模型 as Omit<BedrockModel, 'texture'>;
  if (!Array.isArray(几何?.bones)) throw new Error(`定义生物「${定义.名}」：模型不是基岩几何（缺 bones）`);
  const 变体键 = Object.keys(定义.变体 ?? {}) as (keyof V & string)[];

  /** 补上默认值、核对取值；不认识的值报错（拼写错不静默） */
  const 选变体 = (给: Partial<变体选择<V>> = {}): 变体选择<V> => {
    const 出 = {} as 变体选择<V>;
    for (const k of 变体键) {
      const 可选 = 定义.变体![k]!;
      const v = 给[k] ?? 可选[0];
      if (v === undefined || !可选.includes(v)) throw new Error(`「${定义.名}」的变体 ${k} 没有 ${String(v)}（可选：${可选.join('、')}）`);
      出[k] = v as 变体选择<V>[typeof k];
    }
    return 出;
  };

  // 同一组合返回同一个模型对象：基岩模型.tsx 按模型对象缓存几何、材质
  const 模型缓存 = new Map<string, BedrockModel>();
  const 取模型 = (给?: Partial<变体选择<V>>): BedrockModel => {
    const 变体 = 选变体(给);
    const 键 = JSON.stringify(变体键.map((k) => 变体[k]));
    let m = 模型缓存.get(键);
    if (!m) {
      const 贴图 = typeof 定义.贴图 === 'function' ? 叠贴图(定义.贴图(变体).map(读)) : 读(定义.贴图);
      if (贴图.w !== 几何.texW || 贴图.h !== 几何.texH) console.warn(`「${定义.名}」贴图 ${贴图.w}×${贴图.h} 和模型的 ${几何.texW}×${几何.texH} 不一样（UV 按模型的算）`);
      模型缓存.set(键, (m = { ...几何, texture: 贴图 }));
    }
    return m;
  };

  const 组件: FC<生物属性<V>> = (p) =>
    createElement(
      'group',
      { position: p.pose.loc, rotation: [0, 0, rad(p.pose.yaw ?? 0)] },
      createElement(基岩实体, {
        模型: 取模型(p.变体),
        缩放: 定义.缩放,
        动画:
          动画文件 && 定义.动画
            ? { 文件: 动画文件, 层们: p.层们 ?? 定义.动画.默认层们, 口径: 定义.动画.口径, 环境: { ...定义.动画.环境, ...p.环境 } }
            : undefined,
        秒: p.秒,
        姿势: p.姿势,
        受伤: p.受伤,
        光照: p.光照,
        透明度: p.透明度,
        发光: p.发光,
        发光骨骼: 定义.发光骨骼,
        挂载: p.挂载,
      }),
    );
  组件.displayName = 定义.名;
  return Object.assign(组件, { 定义, 动画文件, 取模型, 选变体 });
};
