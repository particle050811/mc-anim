// 娘化亚波伦（用户 11-09 定用 YSM 版）：作者 4911 的 YSM 玩家模型包「使徒娘化版」（GPL v3），几何、贴图、动画都是包里的原文件，
// 用 定义生物 声明。骨骼和现成动作的清单见同目录 说明.md。
// 缩放：ysm.json 的 height_scale、width_scale 都是 0.7。
// 贴图五张是同一套 UV 的五个外观（包的 default_texture 是 4default；本片用 default，下界二阶段）：
//   default  红边，蜘蛛腿、8 个浮块、头后眼形大光环；没有面纱、没有帽子上方的红色漩涡小光环
//   2default 红边，面纱、漩涡光环      3default 金边，漩涡光环      4default 金边，面纱、漩涡光环（作者视频封面就是这张）      5default 红边，漩涡光环
// 面纱是帽子下的骨骼 bone25（三片：脸前、脑后、右侧），漩涡光环是 ysmGlowbone185；它们显不显只看贴图上那块 UV 有没有像素，没有变量管
// （ysm.json 的 v.red_bow_headdress 管的是骨骼 Ribbon，这个模型里没有这根骨骼，开关不起作用）。
// 变体 面纱、漩涡光环 写「加」时，把 2default 上那两块像素叠到所选贴图上（default 上这两块本来是空的）：包里没有这种组合，是本片自己拼的。
// 口径用 '通用'：YSM 2.6.5 的播放器在原生库里，核对不了；按 YSM wiki「并行动画」一页，pre_parallel 低于主动画、parallel 高于主动画且转角相加。
// 包里的 controller/main.animation_controllers.json 八个控制器全是空状态（animations: []），不用接。
import type { FC, ReactNode } from 'react';
import type { Molang环境 } from '@engine/anim/Molang.ts';
import { 二阶推进器, 二阶稳态, type 二阶函数 } from '@engine/anim/二阶系统.ts';
import { 动画姿势, type 动画层设定 } from '@engine/model/基岩实体.tsx';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import type { 实体光照 } from '@engine/model/实体材质.ts';
import { png, type Png } from '@engine/model/贴图.ts';
import { 定义生物 } from '@库/生物/定义生物.ts';
import { 手持下界魔杖 } from '../物品/下界魔杖.tsx';
import 表情动画 from 'asset:动画/角色/娘化亚波伦/extra';
import 主动画 from 'asset:动画/角色/娘化亚波伦/main';
import 模型 from 'asset:模型/角色/娘化亚波伦';
import 贴图2 from 'asset:贴图/角色/娘化亚波伦/2default';
import 贴图3 from 'asset:贴图/角色/娘化亚波伦/3default';
import 贴图4 from 'asset:贴图/角色/娘化亚波伦/4default';
import 贴图5 from 'asset:贴图/角色/娘化亚波伦/5default';
import 贴图1 from 'asset:贴图/角色/娘化亚波伦/default';

const 贴图们 = { default: 贴图1, '2default': 贴图2, '3default': 贴图3, '4default': 贴图4, '5default': 贴图5 } as const;
export type 亚波伦贴图 = keyof typeof 贴图们;

// 贴图上的两块 UV（像素，左上角起，[x0, y0, x1, y1)）：bone25 六个面合起来的范围、ysmGlowbone185 的上下两面
const 面纱块 = [218, 339, 241, 372] as const;
const 漩涡块 = [192, 0, 256, 64] as const;
/** 只留一块矩形里的像素，别处全透明（当一层叠到别的贴图上） */
const 只留 = (图: Png, [x0, y0, x1, y1]: readonly [number, number, number, number]): Png => {
  const px = new Uint8Array(图.px.length);
  for (let y = y0; y < y1; y++) px.set(图.px.subarray((y * 图.w + x0) * 4, (y * 图.w + x1) * 4), (y * 图.w + x0) * 4);
  return { w: 图.w, h: 图.h, px };
};
let 层缓存: { 面纱: Png; 漩涡: Png } | undefined;
const 补层 = () => (层缓存 ??= { 面纱: 只留(png(贴图2), 面纱块), 漩涡: 只留(png(贴图2), 漩涡块) });

// main 50 段和 extra 8 段（extra0～extra7）名字不重，并成一份
const 动画文件 = { animations: { ...(主动画 as unknown as { animations: object }).animations, ...(表情动画 as unknown as { animations: object }).animations } };

/** 动画里读到的查询和 ysm.* 变量，站着不动时的值（没列的按 0 算）。飞、走的镜头按时间给 ground_speed（走约 1.7、跑约 3.2、飞 20，YSM wiki）、
 *  vertical_speed（米/秒，朝上为正）、yaw_speed、head_yaw、head_pitch（度）：头发、胸部的弹簧就吃这几个 */
export const 静止环境: Molang环境 = {
  查询: { ground_speed: 0, vertical_speed: 0, yaw_speed: 0 },
  外部: { 'ysm.head_yaw': 0, 'ysm.head_pitch': 0, 'ysm.elytra_rot_z': 0 },
};

export const 娘化亚波伦生物 = 定义生物({
  名: '娘化亚波伦',
  模型,
  贴图: (v) => [贴图们[v.贴图], ...(v.面纱 === '加' ? [补层().面纱] : []), ...(v.漩涡光环 === '加' ? [补层().漩涡] : [])],
  变体: { 贴图: ['default', '2default', '3default', '4default', '5default'], 面纱: ['原样', '加'], 漩涡光环: ['原样', '加'] },
  缩放: 0.7 / 16,
  动画: { 文件: 动画文件, 默认层们: [], 口径: '通用', 环境: 静止环境 },
});

// 低优先级并行（主动画盖它）：0 头发的弹簧，1 眨眼（4 秒一遍，0.083～0.208 秒闭着），2 把拔刀剑的两个定位骨骼缩没。3～7 是空的
const 低优先并行: readonly 动画层设定[] = ['pre_parallel0', 'pre_parallel1', 'pre_parallel2'].map((名) => ({ 名 }));
// 并行（盖主动画，转角相加）：0 眼睛跟头、胸部弹簧、浮块和漩涡光环自转，1 头饰开关（写的 Ribbon 这个模型没有）。2～7 是空的
const 并行: readonly 动画层设定[] = ['parallel0', 'parallel1'].map((名) => ({ 名, 模式: '叠加' as const }));

/** 一刻的整套层：低优先并行 → 主（从下到上，后面的盖前面的；动作层的 秒 是这段动作自己播到第几秒）→ 并行 */
export const 亚波伦层们 = (主: readonly 动画层设定[]): 动画层设定[] => [...低优先并行, ...主, ...并行];

export type 亚波伦表演 = {
  层们: (秒: number) => readonly 动画层设定[];
  环境: (秒: number) => Molang环境;
  /** 这一刻头发、胸部各弹簧的输出（ysm.second_order） */
  二阶在: (秒: number) => 二阶函数;
};

/**
 * 一场表演：每一刻播哪几层、环境是什么（都得是时间的纯函数）。在模块里建一次，渲哪帧都用同一个。
 * 弹簧 '推进'（默认）：ysm.second_order 从第 0 秒按 1/60 秒一步推到要的时刻（engine/anim/二阶系统.ts，结果只看时间）；
 * '稳态'：弹簧直接等于输入，不晃。
 */
export const 定表演 = (设定: { 主: (秒: number) => readonly 动画层设定[]; 环境?: (秒: number) => Molang环境; 弹簧?: '推进' | '稳态' }): 亚波伦表演 => {
  const 层们 = (秒: number) => 亚波伦层们(设定.主(秒));
  const 环境 = (秒: number): Molang环境 => 设定.环境?.(秒) ?? {};
  const 文件 = 娘化亚波伦生物.动画文件!;
  const 底 = 娘化亚波伦生物.定义.动画!.环境!;
  const 推进器 = 二阶推进器((秒, second_order) => {
    const e = 环境(秒);
    动画姿势({ 文件, 层们: 层们(秒), 口径: '通用', 环境: { 查询: { ...底.查询, ...e.查询 }, 外部: { ...底.外部, ...e.外部 }, 函数: { 'ysm.second_order': second_order } } }, 秒);
  });
  return { 层们, 环境, 二阶在: 设定.弹簧 === '稳态' ? () => 二阶稳态 : 推进器.在 };
};

/** 站着：idle 3 秒一遍 */
export const 站立 = 定表演({ 主: () => [{ 名: 'idle' }] });
/** 悬停：fly 3 秒一遍，蜘蛛腿 c1、c2 跟着扇 */
export const 悬停 = 定表演({ 主: () => [{ 名: 'fly' }] });

export type 娘化亚波伦属性 = {
  pose: { loc: number[]; yaw?: number };
  秒: number;
  /** 默认 站立 */
  表演?: 亚波伦表演;
  /** 默认 default（下界二阶段），面纱、漩涡光环照贴图原样 */
  变体?: { 贴图?: 亚波伦贴图; 面纱?: '原样' | '加'; 漩涡光环?: '原样' | '加' };
  /** 叠在动画上面，按通道覆盖 */
  姿势?: Record<string, BonePose>;
  受伤?: number;
  光照?: 实体光照;
  透明度?: number;
  /** 右手拿下界魔杖（用户 11-09 定亚波伦手持）：挂在定位骨 RightHandLocator 上；默认不拿 */
  持杖?: boolean;
  挂载?: Record<string, ReactNode>;
};

const 杖挂载 = { RightHandLocator: <手持下界魔杖 /> };

export const 娘化亚波伦: FC<娘化亚波伦属性> = ({ 秒, 表演 = 站立, 持杖, 挂载, ...其余 }) => {
  const e = 表演.环境(秒);
  const 挂 = 持杖 ? { ...杖挂载, ...挂载 } : 挂载;
  return <娘化亚波伦生物 {...其余} 挂载={挂} 秒={秒} 层们={表演.层们(秒)} 环境={{ ...e, 函数: { 'ysm.second_order': 表演.二阶在(秒) } }} />;
};
