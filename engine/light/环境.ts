// 光照环境的描述：维度、时刻、天气、灯光档位、雾、云放在一个对象里，<环境>（环境组件.tsx）照它摆灯、天、云、雾。
// 纯数据和纯函数（不引 react、three、remotion）：段可以在 段.ts 之外的 环境.ts 里声明（定义环境、定义环境轨），测试直接跑。
// MC 的量照 1.20.1 client（srg jar 里 javap 对过）：DimensionType.timeOfDay、moonPhase，ClientLevel.getSkyDarken、getStarBrightness、getSkyColor，
//   DimensionSpecialEffects.getSunriseColor；日月星的透明度 = 1 − 雨（LevelRenderer.renderSky）。Mth.cos 是查表近似，这里用 Math.cos，差在 1e-4 以内。
// 场景坐标：x 东、y 北、z 上（同 engine/light/ 各模块）。原版太阳绕南北轴转：东升、正午在头顶、西落。
import type { 维度信息 } from './维度.ts';

export type V3 = [number, number, number];

/** 天空、灯、云的画法（环境组件.tsx 的画法表）：
 *  主世界 = Photon 物理天空和空气雾 + Photon 云 + 方形太阳（作品/应力转动/地点/飞行镜头.tsx 的 FlightSky 那套）；
 *  暮色 = 暮色森林实拍取色的穹顶和星星 + 线性雾、高度雾、余晖方向雾 + Photon 云配暮色光照（暮色光照.tsx 的 TwilightLighting 那套） */
export type 画法 = '主世界' | '暮色';

/** 灯光档位（数在 灯光档位.ts）：前六个是 光照配比.ts 的档；暮色 = 暮色森林现用的（黄昏档 × 光倍 2），主世界 = 主世界现用的 */
export type 档位名 = '柔档' | '柔档提亮' | '中档' | '强档' | '硬档' | '黄昏' | '暮色' | '主世界';

/** 天气：雨、雷各 0～1（游戏里 rainLevel、thunderLevel）。雷只在下雨时起作用（getThunderLevel 乘了雨） */
export type 天气 = { 雨: number; 雷: number };
export const 晴: 天气 = { 雨: 0, 雷: 0 };
export const 雨天: 天气 = { 雨: 1, 雷: 0 };
export const 雷雨: 天气 = { 雨: 1, 雷: 1 };

/** 场景的雾（three 的 fog）：线性同 TwilightLighting，指数平方同 FlightFog（能见度 = 雾浓到一半的距离，米）。色不给按画法的默认色 */
export type 雾 = { 种类: '线性'; 近: number; 远: number; 色?: string } | { 种类: '指数平方'; 能见度: number; 色?: string } | { 种类: '无' };

/** 高度雾（高度雾.ts）：密度 = 浓度 × 2^(−(h − 起点) / 半衰)，h 是场景 z */
export type 高度雾 = { 起点: number; 半衰: number; 浓度: number };

/** 云：photon = 大气/云.ts 的 PhotonClouds（场景坐标；加 [x, y, 半径] 最多 4 朵，让开 [x, y, 半径, 软边]，镜头周围 [半径, 软边]，天气 0～1）；
 *  原版 = 天空.tsx 的方块云 Clouds（高 = 云底的场景 z，半径 = 铺多远，色 = 云顶色，偏移 = 贴图平移格数） */
export type 云 =
  | {
      种类: 'photon';
      海平面: number;
      天气?: { 温度: number; 湿度: number; 风: number };
      加?: readonly (readonly [number, number, number])[];
      让开?: readonly [number, number, number, number];
      镜头周围?: readonly [number, number];
      曝光?: number;
    }
  | { 种类: '原版'; 高: number; 半径?: number; 色?: string; 偏移?: readonly [number, number] }
  | { 种类: '无' };

/** 美术光向（指向光源）：向量，或方位（度，0 = 北、顺时针）+ 仰角（度） */
export type 光向 = V3 | { 方位: number; 仰角: number };

export type 环境描述 = {
  维度: 维度信息;
  画法: 画法;
  /** 游戏时间（刻）：0 日出、6000 正午、12000 日落、18000 午夜，可以超过 24000（月相按第几天走）。维度时间固定的不给 */
  时刻?: number;
  /** 美术光向，代替时刻算出来的太阳（现有暮色、主世界两套都是美术光向）；给了就不按时刻调灯，和 时刻 只写一个 */
  太阳?: 光向;
  /** 太阳轨道往南倾几度（光影包 sunPathRotation 那类，正 = 正午太阳偏南；原版 0）。只在按时刻算太阳时用 */
  轨道倾角?: number;
  天气?: 天气;
  /** 档位 × 倍（直射、天光、环境光、自发光一起乘） */
  灯光: { 档位: 档位名; 倍?: number };
  雾: 雾;
  高度雾?: 高度雾;
  /** 主世界画法的 Photon 大气：地形远端（米，边界雾在这里融进天色）；null = 不开大气（钻到地下时）。不给 = 40000 */
  大气远?: number | null;
  云: 云;
  /** 主光投影（级联软阴影）：远 = 投影远端（米）。不给：暮色画法按雾远取（暮色光照.tsx 的 shadowFarFor），主世界画法不投影；false = 不投影 */
  投影?: { 远?: number } | false;
};

// ---------- 时刻 → 天体 ----------
export const 一天 = 24000;
/** 游戏每秒 20 刻 */
export const 每秒刻数 = 20;
const 双π = Math.PI * 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const frac = (x: number) => x - Math.floor(x);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** DimensionType.timeOfDay：游戏时间 → 天角（0～1；0 = 太阳在头顶，0.25 = 西边地平线，0.75 = 东边地平线）。日出日落比匀速快一点（余弦修正） */
export const 天角 = (时刻: number) => {
  const d0 = frac(时刻 / 一天 - 0.25);
  const d1 = 0.5 - Math.cos(d0 * Math.PI) / 2;
  return Math.fround(Math.fround(d0 * 2 + d1) / 3);
};

/** 天角 → 一天里的时刻（0～24000，天角 的反函数，二分）。用来说美术光向大约相当于几点 */
export const 天角转时刻 = (角: number) => {
  // 天角随 d0 单调增：d0 = 0 是正午（6000 刻）
  const 目标 = frac(角);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if ((mid * 2 + 0.5 - Math.cos(mid * Math.PI) / 2) / 3 < 目标) lo = mid;
    else hi = mid;
  }
  return (((lo + 0.25) * 一天) % 一天 + 一天) % 一天;
};

/** DimensionType.moonPhase：0 满月 … 4 新月（按第几天，整除向零取） */
export const 月相 = (时刻: number) => ((Math.trunc(Math.floor(时刻) / 一天) % 8) + 8) % 8;
/** DimensionType.MOON_BRIGHTNESS_PER_PHASE */
export const 月相亮度 = [1, 0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75] as const;

/** 天角 → 指向太阳的单位向量（场景坐标）。倾角：轨道往南倾（度） */
export const 太阳方向 = (角: number, 倾角 = 0): V3 => {
  const θ = 角 * 双π;
  const φ = (倾角 * Math.PI) / 180;
  return [-Math.sin(θ), -Math.cos(θ) * Math.sin(φ), Math.cos(θ) * Math.cos(φ)];
};

/** 方位（度，0 = 北、顺时针）、仰角（度）→ 指向光源的单位向量（同 光照配比.ts 的 sunDirFromAngles） */
export const 方位转向量 = (方位: number, 仰角: number): V3 => {
  const a = (方位 * Math.PI) / 180;
  const e = (仰角 * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
};
export const 光向转向量 = (d: 光向): V3 => (Array.isArray(d) ? d : 方位转向量(d.方位, d.仰角));

/** 有效雷：getThunderLevel = 雷 × 雨 */
const 有效雷 = (w: 天气) => w.雷 * w.雨;

/** ClientLevel.getSkyDarken：天光亮度 0.2～1（正午晴天 1，夜里 0.2；雨、雷各压 5/16） */
export const 天空变暗 = (角: number, w: 天气 = 晴) => {
  let f = 1 - clamp01(1 - (Math.cos(角 * 双π) * 2 + 0.2));
  f *= 1 - (w.雨 * 5) / 16;
  f *= 1 - (有效雷(w) * 5) / 16;
  return f * 0.8 + 0.2;
};

/** ClientLevel.getStarBrightness × (1 − 雨)：星星不透明度 0～0.5 */
export const 星星亮度 = (角: number, w: 天气 = 晴) => {
  const f = clamp01(1 - (Math.cos(角 * 双π) * 2 + 0.25));
  return f * f * 0.5 * (1 - w.雨);
};

/** getSkyColor 里群系天色乘的系数（正午 1，夜里 0） */
export const 天色倍 = (角: number) => clamp01(Math.cos(角 * 双π) * 2 + 0.5);

/** getSkyColor 的雨、雷去饱和：rgb（0～1）往亮度灰里拉 */
export const 雨天天色 = (rgb: readonly [number, number, number], w: 天气): [number, number, number] => {
  let [r, g, b] = rgb;
  if (w.雨 > 0) {
    const 灰 = (r * 0.3 + g * 0.59 + b * 0.11) * 0.6;
    const k = 1 - w.雨 * 0.75;
    [r, g, b] = [r * k + 灰 * (1 - k), g * k + 灰 * (1 - k), b * k + 灰 * (1 - k)];
  }
  const 雷 = 有效雷(w);
  if (雷 > 0) {
    const 灰 = (r * 0.3 + g * 0.59 + b * 0.11) * 0.2;
    const k = 1 - 雷 * 0.75;
    [r, g, b] = [r * k + 灰 * (1 - k), g * k + 灰 * (1 - k), b * k + 灰 * (1 - k)];
  }
  return [r, g, b];
};

/** DimensionSpecialEffects.getSunriseColor：日出日落时太阳那边地平线的晚霞色 [r, g, b, 浓]，不在早晚过渡里是 null（暮色森林的效果不画，恒 null） */
export const 晨昏色 = (角: number): [number, number, number, number] | null => {
  const c = Math.cos(角 * 双π);
  if (c < -0.4 || c > 0.4) return null;
  const f3 = (c / 0.4) * 0.5 + 0.5;
  let f4 = 1 - (1 - Math.sin(f3 * Math.PI)) * 0.99;
  f4 *= f4;
  return [f3 * 0.3 + 0.7, f3 * f3 * 0.7 + 0.2, 0.2, f4];
};

// ---------- 描述 → 灯 ----------
/** 实际用的游戏时间：维度固定的取固定时刻 */
export const 有效时刻 = (e: 环境描述): number | null => e.维度.固定时刻 ?? e.时刻 ?? null;

// 按时刻算灯时太阳贴着地平线淡出、换成月光的那一段（仰角正弦），和月光对日光的比例：暂定，没对过游戏
const 地平淡出: [number, number] = [-0.03, 0.1];
export const 月光比 = 0.1;

export type 灯光系数 = {
  /** 主光指向哪（美术光向原样，不归一；按时刻算的是单位向量） */
  光向: V3;
  /** 天上的太阳往哪（穹顶的太阳、Photon 大气用）；美术光向时同 光向 */
  太阳: V3;
  /** 主光现在是月亮 */
  月光: boolean;
  /** 直射（主光）乘多少 */
  直射倍: number;
  /** 天光、环境光乘多少 */
  天光倍: number;
};

/** 环境 → 主光朝向和直射、天光的倍数。美术光向：晴天两个倍数正好是 1（预设和现有组件逐像素一样）；按时刻：天光照 getSkyDarken，太阳落下换月光 */
export const 灯光系数 = (e: 环境描述): 灯光系数 => {
  const w = e.天气 ?? 晴;
  if (e.太阳 !== undefined) {
    const d = 光向转向量(e.太阳);
    const 晴天 = w.雨 === 0 && w.雷 === 0;
    return { 光向: d, 太阳: d, 月光: false, 直射倍: 晴天 ? 1 : 1 - w.雨, 天光倍: 晴天 ? 1 : 天空变暗(0, w) };
  }
  const t = 有效时刻(e);
  if (t === null) throw new Error(`环境（${e.维度.id}）没给 时刻，也没给 太阳`);
  const 角 = 天角(t);
  const 日 = 太阳方向(角, e.轨道倾角 ?? 0);
  const 月: V3 = [-日[0], -日[1], -日[2]];
  const 日强 = smoothstep(地平淡出[0], 地平淡出[1], 日[2]);
  const 月强 = 月光比 * 月相亮度[月相(t)]! * smoothstep(地平淡出[0], 地平淡出[1], 月[2]);
  const 月光 = 月强 > 日强;
  return { 光向: 月光 ? 月 : 日, 太阳: 日, 月光, 直射倍: (月光 ? 月强 : 日强) * (1 - w.雨), 天光倍: 天空变暗(角, w) };
};

// ---------- 校验 ----------
const 查天气 = (w: 天气, 名: string) => {
  for (const k of ['雨', '雷'] as const) if (!(w[k] >= 0 && w[k] <= 1)) throw new Error(`${名}：天气.${k} = ${w[k]}，要在 0～1`);
};

/** 查一份环境描述，有问题直接抛（模块加载时就报，不等渲到那一帧） */
export const 定义环境 = (e: 环境描述, 名 = '环境'): 环境描述 => {
  const 固定 = e.维度.固定时刻;
  if (e.时刻 !== undefined) {
    if (!Number.isFinite(e.时刻)) throw new Error(`${名}：时刻 ${e.时刻} 不是数`);
    if (固定 !== undefined) throw new Error(`${名}：${e.维度.id} 的时间固定在 ${固定}，时刻 不起作用；要换光向写 太阳`);
    if (e.太阳 !== undefined) throw new Error(`${名}：时刻 和 太阳 只写一个（太阳 是美术光向，代替时刻算出的太阳）`);
  }
  if (e.太阳 !== undefined) {
    const d = 光向转向量(e.太阳);
    if (!d.every(Number.isFinite) || Math.hypot(...d) === 0) throw new Error(`${名}：太阳 ${JSON.stringify(e.太阳)} 不是有效方向`);
  } else if (e.时刻 === undefined && 固定 === undefined) throw new Error(`${名}：${e.维度.id} 要写 时刻 或 太阳`);
  if (e.天气) 查天气(e.天气, 名);
  if (e.灯光.倍 !== undefined && !(e.灯光.倍 > 0)) throw new Error(`${名}：灯光.倍 ${e.灯光.倍} 要大于 0`);
  const f = e.雾;
  if (f.种类 === '线性' && !(f.近 >= 0 && f.远 > f.近)) throw new Error(`${名}：线性雾 近 ${f.近}、远 ${f.远} 要 0 ≤ 近 < 远`);
  if (f.种类 === '指数平方' && !(f.能见度 > 0)) throw new Error(`${名}：能见度 ${f.能见度} 要大于 0`);
  if (e.高度雾 && !(e.高度雾.半衰 > 0 && e.高度雾.浓度 >= 0)) throw new Error(`${名}：高度雾 半衰要大于 0、浓度不能是负的`);
  if (e.云.种类 === 'photon' && (e.云.加?.length ?? 0) > 4) throw new Error(`${名}：Photon 云最多加 4 朵`);
  if (e.投影 && e.投影.远 !== undefined && !(e.投影.远 > 0)) throw new Error(`${名}：投影.远 ${e.投影.远} 要大于 0`);
  return e;
};

// ---------- 随帧变：关键帧 ----------
/** 从这一帧到下一帧怎么过渡：线性、平滑（smoothstep）、阶跃（到下一帧才跳） */
export type 缓动 = '线性' | '平滑' | '阶跃';
/** 关键帧：帧（整数，段内或场内，看 <环境> 的 帧）上时刻、雨、雷是多少；没写的项不在这一帧定，各项各自插值，头尾之外保持 */
export type 环境关键帧 = { 帧: number; 时刻?: number; 雨?: number; 雷?: number; 缓动?: 缓动 };
export type 环境轨 = { 基础: 环境描述; 关键帧: readonly 环境关键帧[] };

export const 是环境轨 = (x: 环境描述 | 环境轨): x is 环境轨 => '关键帧' in x;

export const 定义环境轨 = (轨: 环境轨, 名 = '环境轨'): 环境轨 => {
  定义环境(轨.基础, `${名}.基础`);
  let 上 = -Infinity;
  for (const k of 轨.关键帧) {
    const 键名 = `${名} 第 ${k.帧} 帧`;
    if (!Number.isInteger(k.帧) || k.帧 < 0) throw new Error(`${键名}：帧要是非负整数`);
    if (k.帧 <= 上) throw new Error(`${键名}：关键帧要按帧从小到大、不重复`);
    上 = k.帧;
    if (k.时刻 === undefined && k.雨 === undefined && k.雷 === undefined) throw new Error(`${键名}：时刻、雨、雷至少写一项`);
    if (k.时刻 !== undefined) {
      if (!Number.isFinite(k.时刻)) throw new Error(`${键名}：时刻 ${k.时刻} 不是数`);
      if (轨.基础.太阳 !== undefined) throw new Error(`${键名}：基础 用了美术光向（太阳），时刻 关键帧不起作用`);
      if (轨.基础.维度.固定时刻 !== undefined) throw new Error(`${键名}：${轨.基础.维度.id} 的时间固定在 ${轨.基础.维度.固定时刻}，时刻 关键帧不起作用`);
    }
    for (const f of ['雨', '雷'] as const) if (k[f] !== undefined && !(k[f]! >= 0 && k[f]! <= 1)) throw new Error(`${键名}：${f} = ${k[f]}，要在 0～1`);
  }
  return 轨;
};

const 缓动值 = (方式: 缓动, t: number) => (方式 === '阶跃' ? 0 : 方式 === '平滑' ? t * t * (3 - 2 * t) : t);

/** 某一项在第 帧 帧的值：只看写了这一项的关键帧；一个都没写返回 undefined */
export const 关键帧取值 = (关键帧: readonly 环境关键帧[], 项: '时刻' | '雨' | '雷', 帧: number): number | undefined => {
  const ks = 关键帧.filter((k) => k[项] !== undefined);
  if (!ks.length) return undefined;
  if (帧 <= ks[0]!.帧) return ks[0]![项];
  const 末 = ks[ks.length - 1]!;
  if (帧 >= 末.帧) return 末[项];
  let i = 0;
  while (ks[i + 1]!.帧 <= 帧) i++;
  const a = ks[i]!;
  const b = ks[i + 1]!;
  const t = 缓动值(a.缓动 ?? '线性', (帧 - a.帧) / (b.帧 - a.帧));
  return a[项]! + (b[项]! - a[项]!) * t;
};

/** 第 帧 帧的环境：基础上换掉关键帧定的时刻、雨、雷。传描述就原样返回 */
export const 环境在 = (x: 环境描述 | 环境轨, 帧: number): 环境描述 => {
  if (!是环境轨(x)) return x;
  const 时刻 = 关键帧取值(x.关键帧, '时刻', 帧);
  const 雨 = 关键帧取值(x.关键帧, '雨', 帧);
  const 雷 = 关键帧取值(x.关键帧, '雷', 帧);
  if (时刻 === undefined && 雨 === undefined && 雷 === undefined) return x.基础;
  const 原天气 = x.基础.天气 ?? 晴;
  return {
    ...x.基础,
    ...(时刻 !== undefined ? { 时刻 } : {}),
    ...(雨 !== undefined || 雷 !== undefined ? { 天气: { 雨: 雨 ?? 原天气.雨, 雷: 雷 ?? 原天气.雷 } } : {}),
  };
};

/** 照游戏流速走的时刻（每秒 20 刻 × 倍速）：从 起 刻开始，第 帧 帧（fps）时是几刻。做延时摄影给 倍速 */
export const 按游戏流速 = (起: number, 帧: number, fps: number, 倍速 = 1) => 起 + (帧 / fps) * 每秒刻数 * 倍速;
