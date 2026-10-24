// 第 4 句（段 2-日落划船）谁在哪、镜头在哪：都按歌曲帧算，段和核对段共用。纯模块（不 import react、three）。
// 两个镜头：她右眼的特写（就是第 3 句祭坛那一镜，接着往里推，场/2-祭坛/末态.ts）→「眼化日」到「海平线」叠化，眼珠叠成海平线上的太阳 → 日落的海，
// 船往南偏西（太阳那边）划，镜头跟着船走、拉远一次 →「浪起」一道浪从下沿涌上来，到第 5 句起盖满。时刻在 分镜.ts，数值在 参数.ts。
import type { V3 } from '@engine/model/parts.tsx';
import { 船数, 划船行程, 船上, 船上座位 } from '@库/物品/船原版.ts';
import { fps, 正片事件, 段窗口, 画幅 } from '../../分镜.ts';
import { 天球角 } from '../../地点/天体.ts';
import { 末机, 末距, 末速, 眼珠 } from '../2-祭坛/末态.ts';
import { 她看, 她朝左, 开划提前刻, 海镜, 船头, 太阳高 } from './参数.ts';

export const 段键 = '2-日落划船';
export const 窗 = 段窗口(段键);
export const 事 = 正片事件;
/** 页面尺寸（成片的一半） */
export const 页: { readonly 宽: number; readonly 高: number } = 画幅;

const 夹 = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** 两头速度为 0 的平滑（smoothstep，最快处是平均速度的 1.5 倍） */
const 平滑 = (t: number) => t * t * (3 - 2 * t);
const 插 = (a: number, b: number, k: number) => a + (b - a) * k;
const 度 = Math.PI / 180;

/** 段内帧 → 歌曲帧 */
export const 歌曲帧 = (f: number) => 窗.起帧 + f;
/** 歌曲帧 → 歌上的秒 */
export const 秒 = (g: number) => g / fps;

// ---------- 镜头切换 ----------
/** 匹配剪辑的叠化：海那一镜盖在眼睛上的不透明度，「眼化日」前 0（只有眼睛），「海平线」起 1（只有海），中间两头慢 */
export const 叠化 = (g: number) => 平滑(夹((g - 事.眼化日.帧) / (事.海平线.帧 - 事.眼化日.帧)));
/** 浪的进度：「浪起」0，到段尾（第 5 句起那一帧）1 = 盖满；段的最后一帧差一点盖满，第 5 句接着从 1 往 2 走（浪退出画面） */
export const 浪进 = (g: number) => 夹((g - 事.浪起.帧) / (窗.止帧 - 事.浪起.帧));

// ---------- 太阳 ----------
/** 太阳中心的仰角（度）：原版天球角 0 在头顶、0.25 在西边地平线 */
export const 太阳仰角 = (刻: number) => 90 - 天球角(刻) * 360;
/** 「海平线」那一刻的游戏时间：太阳中心正好高 参数.太阳高 度（傍晚这一段天球角单调，二分） */
export const 日落刻 = (() => {
  let [a, b] = [11000, 13500];
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    if (太阳仰角(m) > 太阳高) a = m;
    else b = m;
  }
  return (a + b) / 2;
})();
/** 歌曲帧 → 游戏刻（20 刻一秒，太阳照原版速度往下落） */
export const 游戏刻 = (g: number) => 日落刻 + ((g - 事.海平线.帧) / fps) * 20;
/** 太阳方向（单位向量）：东升西落，转轴南北 */
export const 太阳方向 = (刻: number): V3 => {
  const a = 天球角(刻) * 2 * Math.PI;
  return [-Math.sin(a), 0, Math.cos(a)];
};
/** 原版太阳本体：离镜头 100 格、半边 7.5 格（贴图 32 格里正中 8 格，整张半边 30） */
export const 太阳本体 = { 距: 100, 半边: 7.5 } as const;

// ---------- 船 ----------
/** 你们开始划（按着前进）的秒数：第二桨的水声落在「桨入水」 */
export const 开划秒 = 事.桨入水.秒 - 开划提前刻 / 20;
const 开划后刻 = (g: number) => (秒(g) - 开划秒) * 20;
/** 船头方向（单位向量，场景 x 东、y 北）：yaw 同 FigurePose，0 朝北、90 朝西 */
const 船向: [number, number] = [-Math.sin(船头 * 度), Math.cos(船头 * 度)];
/** 「海平线」那一刻船在原点 */
const 船起路 = 划船行程(开划后刻(事.海平线.帧)).路;

export type 船态 = { loc: V3; yaw: number; 桨: number | null; 速度: number };
export const 船态 = (g: number): 船态 => {
  const 刻 = 开划后刻(g);
  const { 路, 速度 } = 划船行程(刻);
  const d = 路 - 船起路;
  return { loc: [船向[0] * d, 船向[1] * d, -船数.吃水], yaw: 船头, 桨: 刻 > 0 ? 刻 * 船数.每刻桨转 : null, 速度 };
};

/** 一桨的水声：原版桨位跨过 π/4 的那一刻（开划后第 2、18、34… 刻），两支桨同一刻各一声。只要海上镜头里的（「海平线」到「浪起」） */
export const 桨声秒们 = (): number[] => {
  const r: number[] = [];
  for (let k = 2; 开划秒 + k / 20 <= 事.浪起.秒; k += 16) if (开划秒 + k / 20 >= 事.海平线.秒) r.push(开划秒 + k / 20);
  return r;
};

/** 你：驾船的（第一个上船），坐前面、身子朝船头 */
export const 你位 = (g: number) => {
  const b = 船态(g);
  const 座 = 船上座位(0, { 乘客数: 2, 玩家: true });
  return { loc: 船上(b.loc, b.yaw, 座.位), yaw: b.yaw + 座.转 };
};
/** 她：第二个上船，女仆是动物，侧坐；头往船头那边转一点 */
export const 她位 = (g: number) => {
  const b = 船态(g);
  const 座 = 船上座位(1, { 乘客数: 2, 动物: true, 动物朝左: 她朝左 });
  return { loc: 船上(b.loc, b.yaw, 座.位), yaw: b.yaw + 座.转, 看: [她看.俯仰, 她看.左右] as [number, number] };
};

// ---------- 海上的镜头 ----------
export type 透视 = { 眼: V3; 看: V3; 视角: number };

/** 拉远的进度：「海平线」起、「拉远到位」止，两头慢 */
export const 拉远 = (g: number) => 平滑(夹((g - 事.海平线.帧) / (事.拉远到位.帧 - 事.海平线.帧)));

/** 海上的镜头：跟着船走，从 海镜.匹配 拉到 海镜.到位 */
export const 海机位 = (g: number): 透视 => {
  const b = 船态(g);
  const k = 拉远(g);
  const { 匹配: a, 到位: z } = 海镜;
  const 眼: V3 = [b.loc[0] + 插(a.东, z.东, k), b.loc[1] - 插(a.南, z.南, k), 插(a.高, z.高, k)];
  const 偏 = 插(a.偏, z.偏, k) * 度;
  const 俯 = 插(a.俯, z.俯, k) * 度;
  // 正西是 −x，往北偏 = 往 +y 转
  const 方向: V3 = [-Math.cos(俯) * Math.cos(偏), Math.cos(俯) * Math.sin(偏), -Math.sin(俯)];
  return { 眼, 看: [眼[0] + 方向[0], 眼[1] + 方向[1], 眼[2] + 方向[2]], 视角: 插(a.视角, z.视角, k) };
};

// ---------- 投影（和 three 的 PerspectiveCamera.lookAt 一样：竖直视角、up 朝 +Z、不滚转） ----------
const 减 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const 点乘 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const 叉乘 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const 归一 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** 镜头的基：前、右、上 */
export const 镜头基 = (机: 透视) => {
  const 前 = 归一(减(机.看, 机.眼));
  const 右 = 归一(叉乘(前, [0, 0, 1]));
  const 上 = 叉乘(右, 前);
  return { 前, 右, 上 };
};

/** 从眼出发的方向 d 落在页面上哪里（页面像素，左上角原点）；在镜头后面返回 null */
export const 投影方向 = (机: 透视, d: V3, 宽 = 页.宽, 高 = 页.高): [number, number] | null => {
  const { 前, 右, 上 } = 镜头基(机);
  const z = 点乘(d, 前);
  if (z <= 0) return null;
  const t = Math.tan((机.视角 * 度) / 2);
  const nx = 点乘(d, 右) / z / (t * (宽 / 高));
  const ny = 点乘(d, 上) / z / t;
  return [((nx + 1) / 2) * 宽, ((1 - ny) / 2) * 高];
};
export const 投影点 = (机: 透视, p: V3, 宽 = 页.宽, 高 = 页.高) => 投影方向(机, 减(p, 机.眼), 宽, 高);

/** 页面上 (x, y) 那一点的视线方向（单位向量），投影方向 的反函数 */
export const 视线 = (机: 透视, x: number, y: number, 宽 = 页.宽, 高 = 页.高): V3 => {
  const { 前, 右, 上 } = 镜头基(机);
  const t = Math.tan((机.视角 * 度) / 2);
  const nx = ((x / 宽) * 2 - 1) * t * (宽 / 高);
  const ny = (1 - (y / 高) * 2) * t;
  return 归一([前[0] + 右[0] * nx + 上[0] * ny, 前[1] + 右[1] * nx + 上[1] * ny, 前[2] + 右[2] * nx + 上[2] * ny]);
};

/** 视线的仰角和离太阳的方位差（度）：太阳在正西（天球的转轴是南北，太阳的方位永远是正东或正西） */
export const 仰角方位差 = (d: V3): { 仰: number; 差: number } => {
  const 仰 = Math.asin(夹(d[2], -1, 1)) / 度;
  const 差 = Math.atan2(d[1], d[0]) / 度 - 180;
  return { 仰, 差: ((((差 + 180) % 360) + 360) % 360) - 180 };
};

/** 太阳本体在页面上的中心和边长（页面像素） */
export const 太阳屏幕 = (机: 透视, 刻: number, 宽 = 页.宽, 高 = 页.高) => {
  const d = 太阳方向(刻);
  const c = 投影方向(机, d, 宽, 高);
  if (!c) return null;
  // 本体的上下沿：沿太阳在天球上走的方向（和南北轴垂直）各偏 半边
  const 沿: V3 = 叉乘([0, 1, 0], d);
  const 偏 = (s: number): V3 => [d[0] * 太阳本体.距 + s * 沿[0] * 太阳本体.半边, 0, d[2] * 太阳本体.距 + s * 沿[2] * 太阳本体.半边];
  const 上沿 = 投影方向(机, 偏(1), 宽, 高);
  const 下沿 = 投影方向(机, 偏(-1), 宽, 高);
  const 边 = 上沿 && 下沿 ? Math.hypot(上沿[0] - 下沿[0], 上沿[1] - 下沿[1]) : 0;
  return { x: c[0], y: c[1], 边 };
};

/** 正对着镜头朝向的海平线在页面上的高度（页面像素） */
export const 海平线y = (机: 透视, 高 = 页.高) => {
  const { 前 } = 镜头基(机);
  const p = 投影方向(机, 归一([前[0], 前[1], 0]), 页.宽, 高);
  return p ? p[1] : 高;
};

/** p 处一格有多少页面像素（沿镜头的上方向） */
export const 每格像素 = (机: 透视, p: V3, 高 = 页.高) => {
  const z = 点乘(减(p, 机.眼), 镜头基(机).前);
  return 高 / (2 * z * Math.tan((机.视角 * 度) / 2));
};

// ---------- 眼睛特写 ----------
/** 第 3 句最后一帧（末态.ts 的 末机）的歌曲帧：眼睛特写从这里接着推 */
export const 接帧 = 窗.起帧 - 1;

/** 三次埃尔米特：p0、p1 两头的值，m0、m1 两头每帧的变化率，h 这一段几帧，s 0～1 */
const 埃尔米特 = (p0: number, p1: number, m0: number, m1: number, h: number, s: number) => {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * h * m1;
};

/** 眼睛特写的镜头：第 3 句祭坛那一镜（同一个场景，段把 场/2-祭坛 的画面接过来画），从 末机 接着往她右眼里推，到「眼化日」停稳：
 *  右眼眼珠落在 海镜.匹配 里太阳的位置、和太阳本体一样高。离眼珠的距离取对数用三次插值，起点的速度是 末速（接缝上推镜不停、不跳）；
 *  视角不变，镜头一直朝北（正对她），左右上下平移把眼珠从画面正中慢慢送到太阳的位置 */
export const 眼机位 = (g: number): 透视 => {
  const 日 = 太阳屏幕(海机位(事.眼化日.帧), 游戏刻(事.眼化日.帧))!;
  const t = Math.tan((末机.视角 * 度) / 2);
  const 宽高比 = 页.宽 / 页.高;
  const 止距 = (眼珠.高 * 页.高) / (2 * t * 日.边);
  const h = 事.眼化日.帧 - 接帧;
  const s = 夹((g - 接帧) / h);
  const 距 = Math.exp(埃尔米特(Math.log(末距), Math.log(止距), 末速, 0, h, s));
  const k = 平滑(s);
  const nx = (日.x / 页.宽) * 2 - 1;
  const ny = 1 - (日.y / 页.高) * 2;
  const 眼: V3 = [眼珠.右[0] - k * nx * t * 宽高比 * 距, 眼珠.右[1] - 距, 眼珠.右[2] - k * ny * t * 距];
  return { 眼, 看: [眼[0], 眼[1] + 1, 眼[2]], 视角: 末机.视角 };
};

/** 照片帧（第 8 句第二张照片取这一帧）：歌曲帧 */
export const 照片帧 = 事['照片-日落划船'].帧;
