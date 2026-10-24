// 第 6、7 句这一个镜头（段 2-雷雨、2-拨开阴霾，照片「光柱破云」也取这里）每一帧的样子：镜头、她和你、闪电、魔法阵、光柱、云洞、天气颜色、阳光、雨、掉落物。
// 按歌曲帧算（两段是同一个镜头，照片按歌上的时刻取帧），时刻取 分镜.ts 的正片事件，分寸取 参数.ts。纯模块（测试也引）。
import { clamp01 } from '@engine/anim/anim.ts';
import type { 方块 } from '@engine/model/方块拼搭.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { 插调子, type 调子 } from '@engine/三渲二/调子.ts';
import { fps, 段窗口, 正片事件 } from '../../分镜.ts';
import { 色板 } from '../../色板.ts';
import * as 参 from './参数.ts';
import { 云格, 散起半径, type 云格子 } from './云.ts';
import { 坑, 小木屋, 抗爆, 掉落位, 南墙, type 掉落 } from './弹坑.ts';
import { 四周方块 } from './地形.ts';
import { 雨量 } from './声音.ts';
import { 云色, 天色, 雾色, type RGB } from './天气.ts';
import type { 雨片 } from './雨.tsx';

type 事名 = keyof typeof 正片事件;
export const 事 = (名: 事名) => 正片事件[名].帧;
/** 这个镜头的头尾（歌曲帧，[起, 止)）：2-雷雨 的起到 2-拨开阴霾 的止 */
export const 镜头起帧 = 段窗口('2-雷雨').起帧;
export const 镜头止帧 = 段窗口('2-拨开阴霾').止帧;
/** 歌上的秒、游戏刻（雨、光柱、掉落物、云飘都按它走） */
export const 歌秒 = (帧: number) => 帧 / fps;
export const 刻 = (帧: number) => 歌秒(帧) * 20;

const 插 = (a: number, b: number, t: number) => a + (b - a) * t;
const 插3 = (a: readonly number[], b: readonly number[], t: number): V3 => [插(a[0]!, b[0]!, t), 插(a[1]!, b[1]!, t), 插(a[2]!, b[2]!, t)];
export const 缓 = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const 缓出 = (t: number) => 1 - (1 - clamp01(t)) ** 2;
/** 从 起 那一帧开始、n 帧走完的进度：起那一帧已经走了 1/n */
const 走 = (帧: number, 起: number, n: number) => clamp01((帧 - 起 + 1) / n);

// ---------- 镜头 ----------
export type 机位 = { 种: '透视'; 眼: V3; 看: V3; 视角: number; 远: number };
/** 第 6 句从 全 推到 近（整句缓起缓停），第 7 句从 近 退到 仰（退镜秒 里缓起缓停），之后停住 */
export const 机位 = (帧: number): 机位 => {
  const { 全, 近, 仰 } = 参.机位们;
  const 七 = 事('她站起');
  const [a, b, t] = 帧 < 七 ? [全, 近, 缓((帧 - 镜头起帧) / (七 - 1 - 镜头起帧))] : [近, 仰, 缓((帧 - 七) / (参.退镜秒 * fps))];
  return { 种: '透视', 眼: 插3(a.眼, b.眼, t), 看: 插3(a.看, b.看, t), 视角: 插(a.视角, b.视角, t), 远: 1200 };
};

// ---------- 闪电 ----------
/** 这一帧在不在闪（第6句闷雷 起的那两下） */
export const 闪 = (帧: number) => 参.闪帧们.some(([a, b]) => 帧 - 事('第6句闷雷') >= a && 帧 - 事('第6句闷雷') < b);

// ---------- 她、你 ----------
export type 她态 = { loc: V3; yaw: number; 姿势: '抱膝坐' | '站'; 看: [number, number]; 表情: '难过' | '微笑'; 施法: boolean };
/** 头转过去：起 那一帧起 转头帧 帧转到位 */
const 转头 = (帧: number, 起: number) => 缓(走(帧, 起, 参.转头帧));

export const 她态 = (帧: number): 她态 => {
  const loc = 参.站位.她;
  if (帧 >= 事('她站起')) return { loc, yaw: 参.朝向.她, 姿势: '站', 看: [参.施法仰, 0], 表情: '微笑', 施法: true };
  // 看你：你在她东边（右手边），头往右转（看 的左右正 = 往左）
  const 你方位 = (Math.atan2(参.站位.你[1] - loc[1], 参.站位.你[0] - loc[0]) * 180) / Math.PI - 90 - 参.朝向.她;
  return { loc, yaw: 参.朝向.她, 姿势: '抱膝坐', 看: [-6, 插(0, 你方位, 转头(帧, 事('她看你')))], 表情: '难过', 施法: false };
};

export type 你态 = { loc: V3; yaw: number; 头偏: number; 头仰: number };
export const 你态 = (帧: number): 你态 => {
  const [x, y, z] = 参.站位.你;
  const loc: V3 = [x, y, z - 参.你坐.低];
  const 她方位 = (Math.atan2(参.站位.她[1] - y, 参.站位.她[0] - x) * 180) / Math.PI - 90 - 参.朝向.你;
  if (帧 >= 事('她站起')) {
    // 仰头看光柱（光柱在她头顶，偏左）
    const t = 转头(帧, 事('她站起'));
    return { loc, yaw: 参.朝向.你, 头偏: 插(她方位, 她方位 * 0.5, t), 头仰: 插(0, 参.你仰, t) };
  }
  const t = 转头(帧, 事('你看她'));
  return { loc, yaw: 参.朝向.你, 头偏: 插(0, 她方位, t), 头仰: 插(参.你低头, 0, t) };
};

// ---------- 魔法阵、光柱 ----------
/** 魔法阵展开到多大（0～1） */
export const 阵大小 = (帧: number) => (帧 < 事('阵起') ? 0 : 缓出(走(帧, 事('阵起'), 参.魔法阵.展开帧)));
/** 魔法阵转了几度 */
export const 阵转 = (帧: number) => 歌秒(帧) * 参.魔法阵.每秒转;
/** 光柱顶（z，格）：光柱起 起从底往上冲，拨 那一帧撞到云底；破云 以后穿过洞一直往上（同信标光柱，顶出画面） */
export const 光柱顶 = (帧: number, 底: number) => {
  if (帧 < 事('光柱起')) return 底;
  if (帧 < 事('拨')) return 插(底, 参.云底高, (帧 - 事('光柱起') + 1) / (事('拨') - 事('光柱起')));
  if (帧 < 事('破云')) return 参.云底高;
  return 插(参.云底高, 参.云底高 + 400, 缓出(走(帧, 事('破云'), 4)));
};
/** 光柱的不透明度：光柱退 起 退帧 帧淡掉 */
export const 光柱透 = (帧: number) => 1 - 缓(走(帧, 事('光柱退'), 参.光柱.退帧));
/** 光柱撞云：撞的那一片云底往光柱色亮多少（0～1）：拨 起亮，破云 起 退帧 帧退掉 */
export const 撞亮 = (帧: number) => (帧 < 事('拨') ? 0 : 参.撞云.亮 * (1 - 缓(走(帧, 事('破云'), 参.撞云.退帧))));

// ---------- 云 ----------
/** 云往东挪了多少（格）：原版每刻往西 0.03 格 */
export const 云飘 = (帧: number) => -刻(帧) * 参.云每刻飘;
/** 云洞半径（格）：破云 起开，云洞开大 时到 r1（缓出），之后按比例长到 r2（镜头最后一帧），越开越快 */
export const 洞半径 = (帧: number) => {
  if (帧 < 事('破云')) return 0;
  const { r1, r2 } = 参.云洞;
  if (帧 < 事('云洞开大')) return r1 * 缓出((帧 - 事('破云') + 1) / (事('云洞开大') - 事('破云') + 1));
  return r1 * (r2 / r1) ** clamp01((帧 - 事('云洞开大')) / (镜头止帧 - 1 - 事('云洞开大')));
};
/** 洞心：光柱（她站的地方） */
export const 洞心 = (): [number, number] => [参.站位.她[0], 参.站位.她[1]];
/** 这一格云还剩多少（0～1）：洞半径走过它的 散起半径 那一帧起，散帧 帧里淡掉 */
export const 云剩 = (c: 云格子, 帧: number) => {
  if (帧 < 事('破云')) return 1;
  const r0 = 散起半径(c, 洞心(), 云飘(帧));
  let 起 = 事('破云');
  while (起 <= 帧 && 洞半径(起) < r0) 起++;
  if (起 > 帧) return 1;
  return 1 - clamp01((帧 - 起 + 1) / 参.云洞.散帧);
};
/** 天从哪里透出晴天：视线在云底那一层落到的那一格（同云的格子，跟着云飘）散了多少，0 = 雷雨天、1 = 晴天；破云 前没有（null）。
 *  跟着云格一格一格变（核查 10-24：按正圆判断的话，云还没散、0.8 透明的云后面先透出一块正圆的蓝天）；clouds.png 上空着的格照同一个 散起半径 算 */
export const 天晴在 = (帧: number): ((x: number, y: number) => number) | null => {
  if (帧 < 事('破云')) return null;
  const 飘 = 云飘(帧);
  const 表 = new Map<string, number>();
  return (x, y) => {
    const a = Math.floor((x - 飘) / 云格), b = Math.floor(y / 云格);
    const k = `${a},${b}`;
    let v = 表.get(k);
    if (v === undefined) {
      v = 1 - 云剩({ a, b }, 帧);
      表.set(k, v);
    }
    return v;
  };
};

// ---------- 天气、调子 ----------
/** 雷暴等级跟着雨量收 */
const 雷 = (帧: number) => 参.雷暴 * 雨量(帧);
/** 这一帧的颜色：天、雾（洞外）、晴天、晴雾（洞里）、云（云顶色） */
export const 天气色 = (帧: number): { 天: RGB; 雾: RGB; 晴天: RGB; 晴雾: RGB; 云: RGB } => {
  const 雨 = 雨量(帧);
  const 亮 = 闪(帧);
  return { 天: 天色(雨, 雷(帧), 亮), 雾: 雾色(雨, 雷(帧), 亮), 晴天: 天色(0, 0), 晴雾: 雾色(0, 0), 云: 云色(雨, 雷(帧)) };
};
/** 从雷雨往晴走了多少（0～1）：跟着雨量 */
export const 转晴 = (帧: number) => 缓(1 - 雨量(帧));
/** 这一帧的调子：整片后期、3D 受光面都从 雷雨 往 晴调子 走；闪的那两刻受光面满亮 */
export const 这帧调子 = (帧: number): { 后期: 调子; 色调: string } => {
  const 后期 = 插调子(色板.雷雨, 色板[参.晴调子], 转晴(帧));
  return { 后期, 色调: 闪(帧) ? 参.闪电.色调 : 后期.色调 };
};

// ---------- 发光区：她被自己的阵照亮、阳光 ----------
/** 阳光照到多远（格，以洞心为心） */
export const 阳光半径 = (帧: number) => 洞半径(帧) * 参.阳光.比;
/** 平涂的发光区（场景坐标的盒子）：她那一块从 阵起 起；阳光那片用 条数 条横条拼成阶梯状的圆 */
export const 发光区 = (帧: number): number[][] => {
  const out: number[][] = [];
  const [x, y, z] = 参.站位.她;
  if (帧 >= 事('阵起')) {
    const { 半宽, 高 } = 参.她亮区;
    out.push([x - 半宽, y - 半宽, z - 0.05, x + 半宽, y + 半宽, z + 高]);
  }
  const r = 阳光半径(帧);
  if (r > 0) {
    const n = 参.阳光.条数;
    for (let k = 0; k < n; k++) {
      const y0 = -r + (2 * r * k) / n, y1 = -r + (2 * r * (k + 1)) / n;
      const ym = Math.min(Math.abs(y0), Math.abs(y1));
      const 半 = Math.sqrt(Math.max(0, r * r - ym * ym));
      out.push([x - 半, y + y0, -16, x + 半, y + y1, 参.云底高 - 1]);
    }
  }
  return out;
};
/** 屋子离洞心最远那个角（格）：阳光铺地 时阳光要铺过它 */
export const 屋子最远 = () => {
  const [x, y] = 洞心();
  const 角们 = [[小木屋.西墙 - 1.5, 南墙], [小木屋.东墙 + 1.5, 南墙], [小木屋.西墙 - 1.5, 小木屋.后墙 + 1], [小木屋.东墙 + 1.5, 小木屋.后墙 + 1]] as const;
  return Math.max(...角们.map(([a, b]) => Math.hypot(a - x, b - y)));
};

// ---------- 雨 ----------
let 地表缓存: Map<string, number> | undefined;
/** 每一列最高的挡雨方块顶面（花草、火把不挡） */
export const 地表 = () => {
  if (!地表缓存) {
    const m = new Map<string, number>();
    const 四周 = 四周方块();
    for (const b of [...坑().留下, ...四周.平原, ...四周.樱花林] as 方块[]) {
      if ((抗爆[b.状态.replace(/\[.*$/, '')] ?? 0) === 0 && !/grass_block|dirt|stone|log|leaves/.test(b.状态)) continue;
      const k = `${b.位[0]},${b.位[1]}`;
      m.set(k, Math.max(m.get(k) ?? -Infinity, b.位[2] + 1));
    }
    地表缓存 = m;
  }
  return 地表缓存;
};

/** 透视镜头的雨：照原版，镜头所在那格周围 透视雨半径 以内每一列一张竖片，正对镜头（片的横向垂直于镜头到那一列的方向），
 *  底在那一列的地表，顶在镜头以上 半径 格；越远越淡（(1 − d²/r²)·0.5 + 0.5） */
export const 透视雨片们 = (眼: V3): 雨片[] => {
  const r = 参.透视雨半径;
  const 表 = 地表();
  const [ci, cj] = [Math.round(眼[0]), Math.floor(眼[1])];
  const out: 雨片[] = [];
  for (let i = ci - r; i <= ci + r; i++)
    for (let j = cj - r; j <= cj + r; j++) {
      const [x, y] = [i, j + 0.5];
      const [dx, dy] = [x - 眼[0], y - 眼[1]];
      const d = Math.hypot(dx, dy);
      if (d > r || d < 0.01) continue;
      const 底 = Math.max(表.get(`${i},${j}`) ?? -Infinity, 眼[2] - r);
      if (!Number.isFinite(底)) continue;
      out.push({ i, j, 中心: [x, y], 半宽: [(-dy / d) * 0.5, (dx / d) * 0.5], 底, 顶: 眼[2] + r, 透: (1 - (d * d) / (r * r)) * 0.5 + 0.5 });
    }
  return out;
};

// ---------- 掉落物 ----------
/** 浮在坑里的掉落物（ItemEntity 的位置），照 弹坑.ts 原版算出来的 */
export const 掉落物们 = (): { 物品: string; 个数: number; 位: V3; 浮动偏: number }[] =>
  坑().掉落们.map((d: 掉落) => ({ 物品: d.物品, 个数: d.个数, 位: 掉落位(坑().留下, d), 浮动偏: d.浮动偏 }));
/** 掉落物的 age（刻）：炸了一阵子了（演绎，任取一个数，只管浮动、转圈的相位） */
export const 掉落刻 = (帧: number) => 1200 + 刻(帧 - 镜头起帧);
