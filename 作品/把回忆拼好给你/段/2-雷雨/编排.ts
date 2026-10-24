// 2-雷雨 每一帧谁在哪、什么姿势：镜头、闪电、雨、掉落物、她（帽子当伞）、你、气泡、女仆界面。按段内帧算，时刻取 分镜.ts 的正片事件，分寸取 场/2-雷雨/参数.ts。
// 纯模块（测试也引）：她拿帽子那只胳膊的逆解要用模型骨骼，在 场/2-雷雨/她.tsx 里按这里给的帽子路线解。
import { clamp01 } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { fps, 段内正片事件帧, 段窗口 } from '../../分镜.ts';
import * as 参 from '../../场/2-雷雨/参数.ts';
import { 坑, 掉落位, 玩家捡得到, 落地高 } from '../../场/2-雷雨/弹坑.ts';
import type { 雨片 } from '../../场/2-雷雨/雨.tsx';

const 键 = '2-雷雨';
export const 事 = 段内正片事件帧(键);
const 起帧 = 段窗口(键).起帧;
/** 段内帧 → 歌曲帧（颗粒的种子用它） */
export const 歌曲帧 = (f: number) => 起帧 + f;
/** 段内帧 → 歌上的秒（她的呼吸、尾巴、雨、掉落物按它走） */
export const 歌秒 = (f: number) => (起帧 + f) / fps;

const 插 = (a: number, b: number, t: number) => a + (b - a) * t;
const 插2 = (a: readonly number[], b: readonly number[], t: number): [number, number] => [插(a[0]!, b[0]!, t), 插(a[1]!, b[1]!, t)];
/** 缓进缓出 */
const 缓 = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
/** 从 起 那一帧开始、n 帧走完的进度：起那一帧已经走了 1/n，第 起 + n − 1 帧到 1 */
const 走 = (f: number, 起: number, n: number) => clamp01((f - 起 + 1) / n);

// ---------- 镜头 ----------
type 景 = { N: number; 中心x: number; 地面线: number };
/** 中心取到偶数成片像素（三渲二机位的吸附就不挪，贴图像素的边都在整像素上） */
const 取偶 = (v: number, 每格: number) => (Math.round((v * 每格) / 2) * 2) / 每格;
/** 两个取景之间走到 t（0～1，已缓过）：N 一样就平移；不一样就以一个定点为心纯缩放（c(N) = 定 + (c0 − 定)·N0/N），N 取对数插值、取到偶数（正交机位要偶数），
 *  两头正好落在各自的取景上 */
const 景间 = (a: 景, b: 景, t: number) => {
  const [ca, cb] = [参.坑取景(a.N, a.中心x, a.地面线).中心, 参.坑取景(b.N, b.中心x, b.地面线).中心];
  if (a.N === b.N) {
    const 每格 = 16 * a.N;
    return { 中心: [取偶(插(ca[0], cb[0], t), 每格), 取偶(插(ca[1], cb[1], t), 每格)] as const, 每格 };
  }
  const N = 2 * Math.round(Math.exp(插(Math.log(a.N), Math.log(b.N), t)) / 2);
  const 每格 = 16 * N;
  const 定 = [0, 1].map((k) => (cb[k]! * b.N - ca[k]! * a.N) / (b.N - a.N));
  const c = [0, 1].map((k) => 定[k]! + ((ca[k]! - 定[k]!) * a.N) / N);
  return { 中心: [取偶(c[0]!, 每格), 取偶(c[1]!, 每格)] as const, 每格 };
};
/** 这一帧的剖面取景：全景 →（第6句推近）近景 →（帽子举到你头顶）往上摇到留泡 →（帽子戴回去、气泡收了）摇回近景，一直到「拨」 */
export const 取景 = (f: number) => {
  const { 全景, 近景, 留泡 } = 参.坑镜头;
  const 回摇起 = 事.戴回帽子 + 参.帽动帧.戴回;
  if (f >= 回摇起) return 景间(留泡, 近景, 缓(走(f, 回摇起, 参.坑镜头.摇帧)));
  if (f >= 事.举帽 + 参.帽动帧.举) return 景间(近景, 留泡, 缓(走(f, 事.举帽 + 参.帽动帧.举, 参.坑镜头.摇帧)));
  return 景间(全景, 近景, 缓(走(f, 事.第6句推近, 参.坑镜头.推帧)));
};
/** 这一帧的 N */
export const 镜N = (f: number) => 取景(f).每格 / 16;

// ---------- 闪电 ----------
/** 这一帧亮不亮（闷雷那一拍起，闪帧们） */
export const 闪 = (f: number) => 参.闪帧们.some(([a, b]) => f >= 事.第6句闷雷 + a && f < 事.第6句闷雷 + b);

// ---------- 接第 5 句 ----------
/** 第 5 句末盖满画面的龙蛋紫色粒子（场/2-末地/转场.tsx 的 散）在这一段开头散掉的进度：第 6 句首字起，闷雷前一帧散完，雷闪时坑已经露全（Agent 暂定） */
export const 紫散 = (f: number) => 走(f, 事.第6句开口, 事.第6句闷雷 - 事.第6句开口);

// ---------- 你 ----------
/** 你潜行时的头顶比脚底高多少（格）：同 库/角色/史蒂夫.tsx 的 steveSize(1).crouchHeight（史蒂夫倍数 1） */
export const 潜行头顶 = (32 - 4.2) / 16 - 0.125;
export const 你头顶 = 参.站位.你[2] + 潜行头顶;

export type 你态 = { loc: V3; yaw: number; headYaw: number; headPitch: number };
export const 你态 = (f: number): 你态 => {
  const t = 缓(走(f, 事.你看她, 参.转头帧));
  return { loc: [...参.站位.你] as V3, yaw: 180, headYaw: 插(0, 参.你看她.偏, t), headPitch: 插(参.你发呆低头, 参.你看她.仰, t) };
};

// ---------- 帽子 ----------
/** 帽子的摆法（同 场/2-雷雨/酒狐件.tsx 的 帽摆）；'头上' = 戴在她头上那个位置（要按她的骨骼算，她.tsx 里换成数） */
export type 帽位 = { 位: V3; 朝向: number; 歪: number; 仰: number } | '头上' | '拿起';
export type 帽态 =
  /** 戴在头上，左手放着 */
  | { 种: '戴着' }
  /** 戴在头上，左手往帽檐东沿伸（t 0～1） */
  | { 种: '伸手'; t: number }
  /** 拿在手里：从 从 走到 到（t 0～1，已缓过），中间往上拱 拱；手捏的那一点从 握从 滑到 握到 */
  | { 种: '拿着'; 从: 帽位; 到: 帽位; t: number; 拱: number; 握从: V3; 握到: V3 }
  /** 戴回去了，左手放回来（t 0～1） */
  | { 种: '放手'; t: number };

/** 伞摆：你头顶上方，往她那边偏一点，往你那边歪 */
export const 伞摆 = { 位: [参.站位.你[0] - 参.伞偏西, 参.站位.你[1], 你头顶 + 参.帽檐离头] as V3, 朝向: 180, 歪: 参.帽歪, 仰: 0 };

const 东沿 = [...参.握点.东沿] as V3;
const 西沿 = [...参.握点.西沿] as V3;
const 帽 = 参.帽动帧;
const 拿起起 = 事.摘帽 + 帽.伸手;
const 举起 = 事.举帽;
const 戴回起 = 事.戴回帽子;
const 放手起 = 戴回起 + 帽.戴回;

export const 帽态 = (f: number): 帽态 => {
  if (f < 事.摘帽) return { 种: '戴着' };
  if (f < 拿起起) return { 种: '伸手', t: 缓(走(f, 事.摘帽, 帽.伸手)) };
  if (f < 举起) return { 种: '拿着', 从: '头上', 到: '拿起', t: 缓(走(f, 拿起起, 帽.拿起)), 拱: 0, 握从: 东沿, 握到: 东沿 };
  if (f < 戴回起) return { 种: '拿着', 从: '拿起', 到: 伞摆, t: 缓(走(f, 举起, 帽.举)), 拱: 参.帽拱, 握从: 东沿, 握到: 西沿 };
  if (f < 放手起) return { 种: '拿着', 从: 伞摆, 到: '头上', t: 缓(走(f, 戴回起, 帽.戴回)), 拱: 参.帽拱, 握从: 西沿, 握到: 东沿 };
  if (f < 放手起 + 帽.放手) return { 种: '放手', t: 缓(走(f, 放手起, 帽.放手)) };
  return { 种: '戴着' };
};

/** 帽子这一帧罩在你头顶上（雨停在帽顶上；演绎） */
export const 帽在你头上 = (f: number) => f >= 举起 + 帽.举 && f < 戴回起;

// ---------- 她 ----------
export type 她态 = {
  loc: V3;
  yaw: number;
  表情: '难过' | '微笑';
  看: [number, number];
  秒: number;
  帽: 帽态;
  /** 左手（副手）拿着学徒法术书：你在界面里放进她副手槽那一拍起 */
  拿书: boolean;
};

export const 她态 = (f: number): 她态 => {
  const t = 缓(走(f, 事.看你, 参.转头帧));
  const 看: [number, number] = [插(参.她发呆看[0], 参.她看你[0], t), 插(参.她发呆看[1], 参.她看你[1], t)];
  return {
    loc: [...参.站位.她] as V3,
    yaw: 180,
    表情: f >= 事.你看她 + 参.笑晚帧 ? '微笑' : '难过',
    看,
    秒: 歌秒(f),
    帽: 帽态(f),
    拿书: f >= 事.放法术书,
  };
};

// ---------- 气泡 ----------
/** 她头顶的气泡：冒出来到她把帽子戴回去（20 帧）。她那时已经笑了，难过的颜文字不再留着，界面关掉以后也不再露出来（Agent 暂定） */
export const 气泡态 = (f: number): { 字: string } | null => (f >= 事.第6句气泡 && f < 事.戴回帽子 ? { 字: 参.第6句气泡字 } : null);

// ---------- 掉落物 ----------
/** 炸出来、还浮在地上的掉落物：落在你身边的门早被你捡走了（原版捡拾范围），剖面外的不画 */
export const 掉落物们 = () => {
  const { 留下, 掉落们 } = 坑();
  return 掉落们
    .filter((d) => d.格[1] >= 0)
    .map((d) => ({ 物品: d.物品, 个数: d.个数, 位: 掉落位(留下, d) as V3, 浮动偏: d.浮动偏 }))
    .filter((d) => !玩家捡得到(d.位, 参.站位.你));
};
/** 掉落物的 age（游戏刻）：歌上的秒 × 20（炸完到现在早过了好几秒，从多少起无所谓，取歌上的就和别的段接得上） */
export const 掉落刻 = (f: number) => 歌秒(f) * 20;

// ---------- 雨 ----------
/** 挡雨的东西（演绎：原版雨穿过实体）：x0～x1 这一截，雨落到 顶 就停 */
export type 挡雨 = { x0: number; x1: number; 顶: number };

/** 帽子当伞那几帧挡的雨：帽檐、帽身下段、上段各挡一截（帽子歪的那 8° 不管，帽檐两头差 0.04 格） */
export const 帽挡雨 = (f: number): 挡雨[] => {
  if (!帽在你头上(f)) return [];
  const [x, , z] = 伞摆.位;
  return 参.帽形.map((p) => ({ x0: x - p.半宽, x1: x + p.半宽, 顶: z + p.高 }));
};

/** 剖面镜头里的雨片：参.雨片们 每一排、画面横着看得见的每一列（多铺一列），底在那一列最高的实心方块顶上。
 *  挡 只切人前面那片（y < 0.5）：后面的片在人和帽子后面，本来就被挡住 */
export const 雨片们 = (x范围: readonly [number, number], 挡: readonly 挡雨[] = []): 雨片[] => {
  const { 留下 } = 坑();
  const out: 雨片[] = [];
  for (const 排 of 参.雨片们) {
    const j = Math.floor(排.y);
    for (let i = Math.floor(x范围[0]) - 1; i <= Math.ceil(x范围[1]) + 1; i++) {
      const 底 = 落地高(留下, i, j, 64);
      if (!Number.isFinite(底)) continue;
      const 顶 = 底 + 参.雨高;
      const 片 = (u0: number, u1: number, 片底: number): 雨片 => ({ i, j, 中心: [i, 排.y], 半宽: [0.5, 0], 底: 片底, 顶, u0, u1, 透: 排.透 });
      // 这一列横着切成几段：每段的底取挡在这一段上的最高的那个
      const 切点 = new Set([0, 1]);
      const 段挡 = 排.y < 参.站位.她[1] ? 挡 : [];
      for (const a of 段挡) for (const x of [a.x0, a.x1]) if (x > i - 0.5 && x < i + 0.5) 切点.add(x - (i - 0.5));
      const 点们 = [...切点].sort((a, b) => a - b);
      for (let k = 0; k + 1 < 点们.length; k++) {
        const [u0, u1] = [点们[k]!, 点们[k + 1]!];
        const 中 = i - 0.5 + (u0 + u1) / 2;
        const 片底 = 段挡.filter((a) => 中 > a.x0 && 中 < a.x1).reduce((m, a) => Math.max(m, a.顶), 底);
        out.push(片(u0, u1, 片底));
      }
    }
  }
  return out;
};

// ---------- 女仆界面 ----------
export type 界面态 = {
  /** 0～1：浮上来走到哪（1 = 到位） */
  浮: number;
  /** 0～1：整个界面连同背后的暗渐变的不透明度 */
  透: number;
  /** 鼠标（界面像素，相对界面左上角，取整） */
  鼠标: readonly [number, number];
  /** 鼠标上拿着法术书 */
  拿着书: boolean;
  /** 书在哪：快捷栏、手上、副手槽 */
  书在: '快捷栏' | '鼠标' | '副手';
  /** 一个界面像素几个成片像素（偶数；书放进副手以后推近） */
  缩放: number;
  /** 界面左上角（leftPos, topPos）在成片上的位置（偶数像素，不算浮上来的下沉） */
  左上: readonly [number, number];
};

/** 界面推近：缩放从 参.界面缩放 两档两档走到 参.界面推近.缩放，以定点为心（两头正好落在 界面位 和 推近的取景上） */
const 界面取景 = (f: number) => {
  const s0 = 参.界面缩放;
  const { 缩放: s1, 看 } = 参.界面推近;
  const 起 = [参.界面位.左, 参.界面位.上] as const;
  const 止 = [2560 / 2 - 看[0] * s1, (参.歌词下沿 + 1440) / 2 - 看[1] * s1] as const;
  // 缩放取偶数：数值那几个半大的字一点半个界面像素，立绘的宽（67 界面像素）也要落在整页面像素上
  const 缩放 = 2 * Math.round(插(s0, s1, 缓(走(f, 事.放法术书, 参.界面推近.帧))) / 2);
  const 左上 = [0, 1].map((k) => {
    const 定 = (起[k]! * s1 - 止[k]! * s0) / (s1 - s0);
    return Math.round((定 + ((起[k]! - 定) * 缩放) / s0) / 2) * 2;
  });
  return { 缩放, 左上: [左上[0]!, 左上[1]!] as const };
};

/** 格子左上角（界面像素） → 格子中心 */
const 格心 = ([x, y]: readonly [number, number]) => [x + 8, y + 8] as const;
/** 打开界面时鼠标在屏幕正中（原版 Screen 打开时把鼠标放回窗口中心），换成界面坐标 */
export const 鼠标起 = [(2560 / 2 - 参.界面位.左) / 参.界面缩放, (1440 / 2 - 参.界面位.上) / 参.界面缩放] as const;

export const 界面态 = (f: number): 界面态 | null => {
  if (f < 事.界面浮出) return null;
  const 透 = 1 - 走(f, 事.界面淡出, 参.界面淡出帧);
  if (透 <= 0) return null;
  const 浮 = 缓(走(f, 事.界面浮出, 事.界面到位 - 事.界面浮出 + 1));
  const 书格 = 格心(参.快捷栏格(参.书原格));
  const 副手 = 格心(参.副手格);
  let 鼠标: readonly [number, number];
  let 书在: 界面态['书在'];
  if (f < 事.界面到位) {
    鼠标 = 插2(鼠标起, 书格, 缓(走(f, 事.界面浮出, 事.界面到位 - 事.界面浮出)));
    书在 = '快捷栏';
  } else if (f < 事.放法术书) {
    鼠标 = 插2(书格, 副手, 缓((f - 事.界面到位) / (事.放法术书 - 事.界面到位)));
    书在 = '鼠标';
  } else {
    鼠标 = 副手;
    书在 = '副手';
  }
  return { 浮, 透, 鼠标: [Math.round(鼠标[0]), Math.round(鼠标[1])], 拿着书: 书在 === '鼠标', 书在, ...界面取景(f) };
};
