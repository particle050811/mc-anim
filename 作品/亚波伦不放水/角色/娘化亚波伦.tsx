// 娘化亚波伦（用户 11-09 定用 YSM 版）：作者 4911 的 YSM 玩家模型包「使徒娘化版」（GPL v3），几何、贴图、动画都是包里的原文件，
// 用 定义生物 声明。骨骼和现成动作的清单见同目录 说明.md。
// 缩放：ysm.json 的 height_scale、width_scale 都是 0.7。
// 贴图五张是同一套 UV 的五个外观（包的 default_texture 是 4default；本片用 default，下界二阶段）：
//   default  红边，蜘蛛腿、8 个浮块（本片藏掉，见下）、头后眼形大光环；没有面纱、没有帽子上方的红色漩涡小光环
//   2default 红边，面纱、漩涡光环      3default 金边，漩涡光环      4default 金边，面纱、漩涡光环（作者视频封面就是这张）      5default 红边，漩涡光环
// 面纱是帽子下的骨骼 bone25（三片：脸前、脑后、右侧），漩涡光环是 ysmGlowbone185；它们显不显只看贴图上那块 UV 有没有像素，没有变量管
// （ysm.json 的 v.red_bow_headdress 管的是骨骼 Ribbon，这个模型里没有这根骨骼，开关不起作用）。
// 变体 面纱、漩涡光环 写「加」时，把 2default 上那两块像素叠到所选贴图上（default 上这两块本来是空的）：包里没有这种组合，是本片自己拼的。
// 口径用 '通用'：YSM 2.6.5 的播放器在原生库里，核对不了；按 YSM wiki「并行动画」一页，pre_parallel 低于主动画、parallel 高于主动画且转角相加。
// 包里的 controller/main.animation_controllers.json 八个控制器全是空状态（animations: []），不用接。
// 面剔除：ysm.json 写了 all_cutout: true（YSM wiki「项目结构」：「无论材质情况，全部启用面剔除。用于支持负尺寸描边模型」），
// fly 里身后的缺口环（ysmGlowbone172～179）靠它描边：芯外面包一圈零厚度的片，每片只有朝里那面有颜色、朝外那面透明，
// 剔掉背面后从外面看到的是芯加上对面那几片露出来的一圈边（环是黑芯白边，作者视频 BV1GSoUBYEK7 0:33～0:41 里就是这样）。
// engine 的基岩模型不剔背面，零厚度的片只留一面、两面都画，照画的话环有两侧被白片整个盖住。所以这 8 根骨骼的描边片从模型里拿掉，
// 另用只画正面的材质画（描边片），挂回各自的骨骼上。
// 身边的 8 个浮块（ysmGlowbone54～61，default 贴图上 7 彩 1 黑的芯，外面同样一圈黑描边片）：用户 11-10 定不留，芯和描边片都不画。
// 头后的眼形大光环是 ysmGlowbone24（19 张零厚度片，挂在 aaabody 下，不跟头转；模型像素 x ±31、y 42.7～68、z 9.2，只有 default 贴图上有像素）。
// 用户 11-10 定换成晋升之环（特效/晋升之环.tsx，同样挂在 aaabody 上、不跟头转）；候选还没挑，所以先做成属性 头后环：不给时画面不变，给了就藏掉眼形光环换上。
import { useMemo, type FC, type ReactNode } from 'react';
import * as THREE from 'three';
import type { Molang环境 } from '@engine/anim/Molang.ts';
import { 二阶推进器, 二阶稳态, type 二阶函数 } from '@engine/anim/二阶系统.ts';
import { 混合层 } from '@engine/anim/基岩动画.ts';
import { rad } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { 动画姿势, type 动画层设定 } from '@engine/model/基岩实体.tsx';
import { 骨骼矩阵 } from '@engine/model/基岩正解.ts';
import type { BedrockBone, BedrockCube, BedrockModel, BonePose } from '@engine/model/基岩模型.tsx';
import type { 实体光照 } from '@engine/model/实体材质.ts';
import { png, type Png } from '@engine/model/贴图.ts';
import { 合并环境, 定义生物 } from '@库/生物/定义生物.ts';
import { 手持下界魔杖, 手持杖矩阵, 杖尖, 杖尾, 杖头芯, 杖握点 } from '../物品/下界魔杖.tsx';
import { 亚波伦头后环 } from '../特效/晋升之环.tsx';
import type { 环款 } from '../特效/晋升之环形.ts';
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

// ── 描边片（面剔除，见文件头） ──
type 面名 = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
const 发光骨号 = (名: string) => Number(/^ysmGlowbone(\d+)$/.exec(名)?.[1] ?? -1);
const 号在 = (名: string, 起: number, 止: number) => 发光骨号(名) >= 起 && 发光骨号(名) <= 止;
/** 缺口环：描边片另画 */
const 描边骨骼 = (名: string) => 号在(名, 172, 179);
/** 身边的 8 个浮块：用户 11-10 定不留，整根骨骼的方盒（芯和描边片）都拿掉 */
const 浮块骨骼 = (名: string) => 号在(名, 54, 61);
const 是片 = (c: BedrockCube) => c.size.some((v) => Math.abs(v) < 1e-6);
type 几何 = Omit<BedrockModel, 'texture'>;
const 原几何 = 模型 as unknown as 几何;
/** 交给 定义生物 的几何：浮块不留，描边骨骼只留有厚度的芯 */
export const 去描边片 = (g: 几何): 几何 => ({
  ...g,
  bones: g.bones.map((b): BedrockBone => {
    if (!b.cubes) return b;
    if (浮块骨骼(b.name)) return { ...b, cubes: [] };
    return 描边骨骼(b.name) ? { ...b, cubes: b.cubes.filter((c) => !是片(c)) } : b;
  }),
});

/**
 * 一根描边骨骼上各片的面，照贴图上色（片上都是纯色，取 UV 矩形正中那个像素；透明的面不出）。
 * 坐标是骨骼坐标（原点 = pivot，单位像素，X 取负，同 基岩模型.tsx），每面四个角从它朝的那一侧看是 左上、右上、右下、左下。
 */
export const 描边面 = (骨: BedrockBone, 图: Png): { 面: 面名; 角: [number, number, number][]; 色: [number, number, number] }[] => {
  const 出: ReturnType<typeof 描边面> = [];
  for (const c of 骨.cubes ?? []) {
    if (!是片(c) || Array.isArray(c.uv)) continue;
    const [sx, sy, sz] = c.size;
    const [x0, x1, y0, y1, z0, z1] = [-(c.origin[0] + sx), -c.origin[0], c.origin[1], c.origin[1] + sy, c.origin[2], c.origin[2] + sz];
    const 各面: Record<面名, [number, number, number][]> = {
      north: [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]],
      south: [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]],
      east: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]],
      west: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]],
      up: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
      down: [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]],
    };
    const 面积 = { north: sx * sy, south: sx * sy, east: sy * sz, west: sy * sz, up: sx * sz, down: sx * sz };
    for (const 面 of Object.keys(c.uv) as 面名[]) {
      const u = c.uv[面]!;
      if (面积[面] < 1e-9 || u.uv_size[0] === 0 || u.uv_size[1] === 0) continue;
      const px = Math.min(图.w - 1, Math.max(0, Math.floor(u.uv[0] + u.uv_size[0] / 2)));
      const py = Math.min(图.h - 1, Math.max(0, Math.floor(u.uv[1] + u.uv_size[1] / 2)));
      const i = (py * 图.w + px) * 4;
      if (图.px[i + 3]! < 26) continue;
      出.push({ 面, 角: 各面[面].map(([x, y, z]) => [x + 骨.pivot[0], y - 骨.pivot[1], z - 骨.pivot[2]]), 色: [图.px[i]!, 图.px[i + 1]!, 图.px[i + 2]!] });
    }
  }
  return 出;
};

// 只画正面、不受光、不过色调映射（这 8 根都是 ysmGlow 发光骨骼，和 engine 的发光材质一个算法）。受伤发红、透明度没接：用到再说
const 描边材质 = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.FrontSide, toneMapped: false });
const 描边缓存 = new WeakMap<Png, Record<string, ReactNode>>();
/** 一张贴图对应的描边片，按骨骼名给 挂载 用 */
const 描边挂载 = (图: Png): Record<string, ReactNode> => {
  let 表 = 描边缓存.get(图);
  if (表) return 表;
  表 = {};
  for (const 骨 of 原几何.bones) {
    if (!描边骨骼(骨.name)) continue;
    const 面们 = 描边面(骨, 图);
    if (!面们.length) continue;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const 色 = new THREE.Color();
    for (const f of 面们) {
      const 底 = pos.length / 3;
      色.setRGB(f.色[0] / 255, f.色[1] / 255, f.色[2] / 255, THREE.SRGBColorSpace);
      for (const p of f.角) {
        pos.push(...p);
        col.push(色.r, 色.g, 色.b);
      }
      idx.push(底, 底 + 3, 底 + 2, 底, 底 + 2, 底 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    表[骨.name] = <mesh geometry={g} material={描边材质} />;
  }
  描边缓存.set(图, 表);
  return 表;
};

export const 娘化亚波伦生物 = 定义生物({
  名: '娘化亚波伦',
  模型: 去描边片(原几何),
  贴图: (v) => [贴图们[v.贴图], ...(v.面纱 === '加' ? [补层().面纱] : []), ...(v.漩涡光环 === '加' ? [补层().漩涡] : [])],
  变体: { 贴图: ['default', '2default', '3default', '4default', '5default'], 面纱: ['原样', '加'], 漩涡光环: ['原样', '加'] },
  缩放: 0.7 / 16,
  动画: { 文件: 动画文件, 默认层们: [], 口径: '通用', 环境: 静止环境 },
});

// 低优先级并行（主动画盖它）：0 头发的弹簧，1 眨眼（4 秒一遍，0.083～0.208 秒闭着），2 把拔刀剑的两个定位骨骼缩没。3～7 是空的
const 低优先并行: readonly 动画层设定[] = ['pre_parallel0', 'pre_parallel1', 'pre_parallel2'].map((名) => ({ 名 }));
// 并行（盖主动画，转角相加）：0 眼睛跟头、胸部弹簧、浮块（藏掉了，骨骼照转）和漩涡光环自转，1 头饰开关（写的 Ribbon 这个模型没有）。2～7 是空的
const 并行: readonly 动画层设定[] = ['parallel0', 'parallel1'].map((名) => ({ 名, 模式: '叠加' as const }));

/** 一刻的整套层：低优先并行 → 主（从下到上，后面的盖前面的；动作层的 秒 是这段动作自己播到第几秒）→ 并行 */
export const 亚波伦层们 = (主: readonly 动画层设定[]): 动画层设定[] => [...低优先并行, ...主, ...并行];

export type 亚波伦表演 = {
  层们: (秒: number) => readonly 动画层设定[];
  环境: (秒: number) => Molang环境;
  /** 这一刻头发、胸部各弹簧的输出（ysm.second_order） */
  二阶在: (秒: number) => 二阶函数;
  /** 持杖 而没另给 姿势 时右臂怎么摆 */
  持杖姿势: Readonly<Record<string, BonePose>>;
};

/**
 * 持杖的默认摆法「斜举」（用户 11-10 定魔杖平时「斜举着」，不要垂手横握：杖横在腰前、杖头朝前，和身前的东西叠成一团）。
 * 只摆右臂三根骨骼（按通道盖掉动画里右臂的转角，左臂照原动作）：杖握在身体右侧，杖头朝斜上、往外、略往前，从正面和她右前方看杖头都不压脸和帽子。
 * 站：idle 这类身子直立的动作。上臂往外抬 40 度、肘微弯、手腕外旋 70 度，杖和竖直约成 31 度，杖头在帽檐外侧、齐帽顶高。
 * 飞：fly 里上身往她右边倒约 45 度、还拧着（UpBody、UpperBody），头和帽子跟着偏到右肩上方，照「站」的朝向摆杖头会贴着帽子，
 *     所以杖也跟着身子往外倒：和竖直约成 56 度（比站时斜），杖头在帽子外侧。原动作里右手合在胸前，这里整个盖掉。
 * 手腕只绕小臂的长轴转（RightHand 的 rot 只有 y）：杖身和小臂垂直，从手的两个侧面穿出去，是握拳攥着的样子（用户 11-10：杖要握在手里）。
 * 手腕带 x、z 转角的话杖身斜着顺向小臂，会从袖口里穿过去、手被袖口挡住。飞 的三组角是固定杖的方向按这个条件搜出来的，手比原来往里收了约 0.19 格。
 * 角度是对着核对段的静帧取的（各比过几组），没经用户看过。
 */
export const 斜举 = {
  站: { RightArm: { rot: [10, 0, 40] }, RightForeArm: { rot: [-30, 0, 0] }, RightHand: { rot: [0, 70, 0] } },
  飞: { RightArm: { rot: [40.5, -40, 74] }, RightForeArm: { rot: [-64, 0, 0] }, RightHand: { rot: [0, 122, 0] } },
} satisfies Record<string, Record<string, BonePose>>;

/**
 * 一场表演：每一刻播哪几层、环境是什么（都得是时间的纯函数）。在模块里建一次，渲哪帧都用同一个。
 * 弹簧 '推进'（默认）：ysm.second_order 从第 0 秒按 1/60 秒一步推到要的时刻（engine/anim/二阶系统.ts，结果只看时间）；
 * '稳态'：弹簧直接等于输入，不晃。
 */
export const 定表演 = (设定: {
  主: (秒: number) => readonly 动画层设定[];
  环境?: (秒: number) => Molang环境;
  弹簧?: '推进' | '稳态';
  /** 默认 斜举.站；主动作是 fly 的给 斜举.飞 */
  持杖姿势?: Readonly<Record<string, BonePose>>;
}): 亚波伦表演 => {
  const 层们 = (秒: number) => 亚波伦层们(设定.主(秒));
  const 环境 = (秒: number): Molang环境 => 设定.环境?.(秒) ?? {};
  const 文件 = 娘化亚波伦生物.动画文件!;
  const 底 = 娘化亚波伦生物.定义.动画!.环境!;
  const 推进器 = 二阶推进器((秒, second_order) => {
    const e = 环境(秒);
    动画姿势({ 文件, 层们: 层们(秒), 口径: '通用', 环境: { 查询: { ...底.查询, ...e.查询 }, 外部: { ...底.外部, ...e.外部 }, 函数: { 'ysm.second_order': second_order } } }, 秒);
  });
  return { 层们, 环境, 二阶在: 设定.弹簧 === '稳态' ? () => 二阶稳态 : 推进器.在, 持杖姿势: 设定.持杖姿势 ?? 斜举.站 };
};

/** 站着：idle 3 秒一遍 */
export const 站立 = 定表演({ 主: () => [{ 名: 'idle' }] });
/** 悬停：fly 3 秒一遍，蜘蛛腿 c1、c2 跟着扇 */
export const 悬停 = 定表演({ 主: () => [{ 名: 'fly' }], 持杖姿势: 斜举.飞 });

export type 娘化亚波伦属性 = {
  pose: { loc: number[]; yaw?: number };
  秒: number;
  /** 默认 站立 */
  表演?: 亚波伦表演;
  /** 默认 default（下界二阶段），面纱、漩涡光环照贴图原样 */
  变体?: { 贴图?: 亚波伦贴图; 面纱?: '原样' | '加'; 漩涡光环?: '原样' | '加' };
  /** 叠在动画上面，按通道覆盖。持杖 而不给时用表演的 持杖姿势（斜举）；给了就只用给的（开盘、指向结界这些自己摆右臂） */
  姿势?: Readonly<Record<string, BonePose>>;
  受伤?: number;
  光照?: 实体光照;
  透明度?: number;
  /** 头后换成晋升之环的哪一款（特效/晋升之环形.ts）：给了就藏掉包里的眼形大光环（ysmGlowbone24），在头后挂晋升之环（挂 aaabody）；不给照旧画眼形大光环。
   *  用户 11-10 定要换，候选没挑，挑定后再把默认改过来 */
  头后环?: 环款;
  /** 晋升之环转到第几秒的样子，不给用 秒 */
  环秒?: number;
  /** 右手拿下界魔杖（用户 11-09 定亚波伦手持）：挂在定位骨 RightHandLocator 上、握点对到手心（见 握杖修正），右臂默认斜举（见 斜举）；默认不拿 */
  持杖?: boolean;
  /** 持杖 时跟着杖走的东西，物品空间（杖头的芯在 物品/下界魔杖.tsx 的 杖头芯） */
  杖上?: ReactNode;
  /** 持杖时拿哪一根：不给就是原版的下界魔杖。细做的候选（物品/下界魔杖细做.tsx 的 细做杖款）；握点和原版落在同一处，握杖修正照用 */
  杖?: 手持杖款;
  挂载?: Record<string, ReactNode>;
};

/** 一根能拿在右手上的杖：挂 = 挂到 RightHandLocator 上画的东西；矩阵 = 杖自己的空间 → 定位骨的骨骼坐标；尖、芯、尾 是杖自己空间里的点 */
export type 手持杖款 = { 挂: ReactNode; 矩阵: THREE.Matrix4; 尖: readonly number[]; 芯: readonly number[]; 尾: readonly number[] };

/** 这一刻合好的骨骼姿势表：动画各层，上面按通道盖手摆的姿势（同 基岩实体.tsx） */
const 姿势表 = (秒: number, 表演: 亚波伦表演, 姿势: Readonly<Record<string, BonePose>> | undefined) => {
  const 定 = 娘化亚波伦生物.定义;
  const 动画骨骼 = 动画姿势(
    { 文件: 娘化亚波伦生物.动画文件!, 层们: 表演.层们(秒), 口径: 定.动画!.口径, 环境: 合并环境(定.动画!.环境, { ...表演.环境(秒), 函数: { 'ysm.second_order': 表演.二阶在(秒) } }) },
    秒,
  );
  return 混合层([{ 骨骼: 动画骨骼 }, { 骨骼: 姿势 ?? 表演.持杖姿势 }], 'TLM');
};

// 手心：小臂方盒（RightForeArm，模型像素 x −5.29～−2.79、y 18.41～24.91、z −0.73～1.78）露在袖口（y ≈ 20.1）外面那一截的中心，
// 写成 RightForeArm 的骨骼坐标（原点 = pivot (−4.125, 25.075, 0.025)，X 取负）。这个模型的手没有单独的方盒，RightHand 只是个转轴
const 手心 = new THREE.Vector3(-0.08, -5.78, 0.5);
/**
 * 握杖修正（用户 11-10：「这法杖都没有拿到手上」）：定位骨 RightHandLocator 在手腕（袖口里面），照 手持下界魔杖 原样挂的话杖身贴着袖口过、不穿过露出来的手。
 * 这里在定位骨坐标里再平移一下，把杖的握点正好放到手心上：杖身从手那一截方盒的正中穿过去，手腕怎么转都在。返回定位骨坐标里的平移矩阵
 */
const 握杖修正 = (表: Readonly<Record<string, BonePose>>): THREE.Matrix4 => {
  const 缩 = 娘化亚波伦生物.定义.缩放;
  const 腕到臂 = 骨骼矩阵(原几何, 'RightForeArm', 表, 缩).invert().multiply(骨骼矩阵(原几何, 'RightHandLocator', 表, 缩));
  const 要 = 手心.clone().applyMatrix4(腕到臂.invert());
  const 现 = new THREE.Vector3(...杖握点).applyMatrix4(手持杖矩阵());
  return new THREE.Matrix4().makeTranslation(要.x - 现.x, 要.y - 现.y, 要.z - 现.z);
};

// 整根骨骼缩成 0，基岩模型就不画它（engine/model/基岩模型.tsx）
const 藏眼形光环: Readonly<Record<string, BonePose>> = { ysmGlowbone24: { scale: 0 } };

export const 娘化亚波伦: FC<娘化亚波伦属性> = ({ 秒, 表演 = 站立, 持杖, 杖, 杖上, 挂载, 姿势, 头后环, 环秒, ...其余 }) => {
  const e = 表演.环境(秒);
  const 图 = 娘化亚波伦生物.取模型(其余.变体).texture;
  const 修正 = 持杖 ? 握杖修正(姿势表(秒, 表演, 姿势)) : undefined;
  const 修正键 = 修正?.elements.join(',');
  const 转秒 = 环秒 ?? 秒;
  const 挂 = useMemo(
    () => ({
      ...描边挂载(图),
      ...(修正 && {
        RightHandLocator: (
          <group matrix={修正} matrixAutoUpdate={false}>
            {杖 ? 杖.挂 : <手持下界魔杖>{杖上}</手持下界魔杖>}
          </group>
        ),
      }),
      ...(头后环 ? { aaabody: 亚波伦头后环(头后环, 转秒) } : undefined),
      ...挂载,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [图, 修正键, 杖, 杖上, 头后环, 转秒, 挂载],
  );
  const 摆 = 姿势 ?? (持杖 ? 表演.持杖姿势 : undefined);
  const 全姿势 = useMemo(() => (头后环 ? { ...摆, ...藏眼形光环 } : 摆), [头后环, 摆]);
  return <娘化亚波伦生物 {...其余} 姿势={全姿势} 挂载={挂} 秒={秒} 层们={表演.层们(秒)} 环境={{ ...e, 函数: { 'ysm.second_order': 表演.二阶在(秒) } }} />;
};

export type 杖位姿 = {
  /** 杖头最顶上那一点（场景坐标，格） */
  尖: V3;
  /** 杖头的芯 */
  芯: V3;
  /** 杖尾 */
  尾: V3;
  /** 杖身的方向：从杖尾指向杖尖的单位向量 */
  轴: V3;
};

/**
 * 她右手里的下界魔杖这一刻在场景里的位置和朝向：不渲染，按同一张姿势表（动画 + 手摆的姿势）做骨骼正解算出来。
 * 给轮盘定圆心（界面/杖尖轮盘.tsx）、给法术定出手点用；属性和 <娘化亚波伦> 的同名项一个意思，不给 姿势 就是持杖的默认摆法（表演的 持杖姿势），不给 杖 就是原版的下界魔杖。
 * 旧握法：不做握杖修正，杖照定位骨原样挂（<手持下界魔杖> 直接挂 RightHandLocator）；只给封面草稿五稿及以前的旧案留着，不改它们的画面
 */
export const 持杖位姿 = ({ pose, 秒, 表演 = 站立, 姿势, 杖, 旧握法 }: Pick<娘化亚波伦属性, 'pose' | '秒' | '表演' | '姿势' | '杖'> & { 旧握法?: boolean }): 杖位姿 => {
  const 表 = 姿势表(秒, 表演, 姿势);
  const m = new THREE.Matrix4()
    .makeTranslation(pose.loc[0]!, pose.loc[1]!, pose.loc[2]!)
    .multiply(new THREE.Matrix4().makeRotationZ(rad(pose.yaw ?? 0)))
    .multiply(骨骼矩阵(原几何, 'RightHandLocator', 表, 娘化亚波伦生物.定义.缩放));
  if (!旧握法) m.multiply(握杖修正(表));
  m.multiply(杖?.矩阵 ?? 手持杖矩阵());
  const 点 = (p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(m);
  const [尖, 尾] = [点(杖?.尖 ?? 杖尖), 点(杖?.尾 ?? 杖尾)];
  return { 尖: 尖.toArray(), 芯: 点(杖?.芯 ?? 杖头芯).toArray(), 尾: 尾.toArray(), 轴: 尖.clone().sub(尾).normalize().toArray() };
};

/** 她右手手心（握杖修正 对的那一点）在场景里的位置：核对握杖、给手部特写定机位用 */
export const 右手心 = ({ pose, 秒, 表演 = 站立, 姿势 }: Pick<娘化亚波伦属性, 'pose' | '秒' | '表演' | '姿势'>): V3 =>
  手心
    .clone()
    .applyMatrix4(
      new THREE.Matrix4()
        .makeTranslation(pose.loc[0]!, pose.loc[1]!, pose.loc[2]!)
        .multiply(new THREE.Matrix4().makeRotationZ(rad(pose.yaw ?? 0)))
        .multiply(骨骼矩阵(原几何, 'RightForeArm', 姿势表(秒, 表演, 姿势), 娘化亚波伦生物.定义.缩放)),
    )
    .toArray();
