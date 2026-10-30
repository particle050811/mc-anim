// 时间线的通用部分：事件表（每个事件在时间轴上的时刻，可以接在别的事件后面）解成秒和帧，按串排出首尾相接的段窗口。纯模块（段.ts 会 import）。
// 从 作品/把回忆拼好给你/分镜.ts 的 解时刻、解事件、排段 抽出来：那边是「歌曲帧」、写死 fps 24 和原声的网格；这里 fps、时长、扩展的时刻都由调用方给。
// 那份没改（改了让 42 段过期），新作品、新段用这里。帧 = Math.round(秒 × fps)，帧号只在这里由秒取整一次（和 分镜.ts 的 歌曲帧 一样）。

/** 时间轴上的一个时刻。秒、帧：直接给；接：表里另一个事件再往后几秒或几帧（负数往前），可以接在后面才写的事件上 */
export type 基本时刻 = { 秒: number } | { 帧: number } | { 接: string; 加秒?: number; 加帧?: number };
/** 扩展的时刻（如歌网格的 拍、小节、句，见 歌网格.ts）由 解析 换成秒 */
export type 时刻<扩展 = never> = 基本时刻 | 扩展;

export type 事件定义<扩展 = never> = { 在: 时刻<扩展>; /** 为什么在这一刻（用户定的写「用户 MM-DD 定」，Agent 暂定的写暂定） */ 依据?: string };
export type 解出事件 = { 秒: number; 帧: number; 依据: string };

export type 时间轴<扩展 = never> = {
  fps: number;
  /** 扩展时刻 → 秒；没有扩展的时间线不给 */
  解析?: (t: 扩展) => number;
};

const 是基本 = (t: object): t is 基本时刻 => '秒' in t || '帧' in t || '接' in t;

/** 时刻 → 秒；帧 给的按 帧 ÷ fps */
export const 解时刻 = <扩展 = never>(t: 时刻<扩展>, 表: Readonly<Record<string, 事件定义<扩展>>>, 轴: 时间轴<扩展>, 路: readonly string[] = []): number => {
  const o = t as object;
  if (!是基本(o)) {
    if (!轴.解析) throw new Error(`不认识的时刻 ${JSON.stringify(t)}：这条时间线没给 解析（基本时刻只有 秒、帧、接）`);
    return 轴.解析(t as 扩展);
  }
  if ('秒' in o) return o.秒;
  if ('帧' in o) return o.帧 / 轴.fps;
  const 被接 = 表[o.接];
  if (!被接) throw new Error(`接的事件「${o.接}」不在表里`);
  if (路.includes(o.接)) throw new Error(`事件接成了环：${[...路, o.接].join(' → ')}`);
  return 解时刻(被接.在, 表, 轴, [...路, o.接]) + (o.加秒 ?? 0) + (o.加帧 ?? 0) / 轴.fps;
};

/** 时刻 → 帧（取整一次）。直接给 帧 的不经秒绕一圈，免得 帧 ÷ fps × fps 的浮点误差 */
export const 时刻帧 = <扩展 = never>(t: 时刻<扩展>, 表: Readonly<Record<string, 事件定义<扩展>>>, 轴: 时间轴<扩展>): number => {
  const o = t as object;
  if ('帧' in o && 是基本(o)) {
    if (!Number.isInteger(o.帧)) throw new Error(`时刻的帧要是整数：${o.帧}`);
    return o.帧;
  }
  return Math.round(解时刻(t, 表, 轴) * 轴.fps);
};

/** 整张事件表解成秒和帧 */
export const 解事件 = <K extends string, 扩展 = never>(表: Readonly<Record<K, 事件定义<扩展>>>, 轴: 时间轴<扩展>): Record<K, 解出事件> => {
  const r = {} as Record<K, 解出事件>;
  for (const 名 of Object.keys(表) as K[]) {
    const 在 = 表[名].在;
    const 秒 = 解时刻(在, 表, 轴, [名]);
    r[名] = { 秒, 帧: 时刻帧(在, 表, 轴), 依据: 表[名].依据 ?? '' };
  }
  return r;
};

// ---------- 串：同一条时间轴上首尾相接的几段（分镜.ts 的 排段，泛化） ----------

/** 段窗口的止：时刻、按画面长度给帧数，或 放完 = 时间轴最后一个整帧（要给 时长） */
export type 窗口止<扩展 = never> = 时刻<扩展> | { 帧数: number } | '放完';
/** 串里第一段要写 起；后面的段不写就接上一段的止，写了就要正好等于上一段的止。名 只用来报错和查找（不必是段键） */
export type 串段定义<扩展 = never> = { 名: string; 起?: 时刻<扩展>; 止: 窗口止<扩展>; 依据?: string };
export type 串定义<扩展 = never> = { 名: string; /** 时间轴总长（秒）：给了就查窗口不超出 */ 时长?: number; 段们: readonly 串段定义<扩展>[] };
export type 串窗口 = { 名: string; 串: string; 起帧: number; 止帧: number; 帧数: number; 依据: string };

/** 推出一串里每段的窗口（时间轴帧 [起帧, 止帧)），并查首尾相接、不重叠、不超出时长 */
export const 排段 = <扩展 = never>(串: 串定义<扩展>, 表: Readonly<Record<string, 事件定义<扩展>>>, 轴: 时间轴<扩展>): 串窗口[] => {
  const r: 串窗口[] = [];
  const 末帧 = 串.时长 === undefined ? Infinity : Math.floor(串.时长 * 轴.fps + 1e-9);
  for (const d of 串.段们) {
    const 名 = `串「${串.名}」的 ${d.名}`;
    if (r.some((w) => w.名 === d.名)) throw new Error(`${名} 出现了两次`);
    const 上 = r.at(-1);
    let 起帧: number;
    if (d.起) {
      起帧 = 时刻帧(d.起, 表, 轴);
      if (上 && 起帧 !== 上.止帧) throw new Error(`${名} 起在第 ${起帧} 帧，上一段 ${上.名} 止在第 ${上.止帧} 帧：${起帧 > 上.止帧 ? '中间空了' : '重叠了'} ${Math.abs(起帧 - 上.止帧)} 帧`);
    } else if (上) 起帧 = 上.止帧;
    else throw new Error(`${名} 是串里第一段，要写 起`);
    let 止帧: number;
    if (d.止 === '放完') {
      if (末帧 === Infinity) throw new Error(`${名} 写了 放完，串要给 时长`);
      止帧 = 末帧;
    } else if (typeof d.止 === 'object' && d.止 !== null && '帧数' in d.止) 止帧 = 起帧 + d.止.帧数;
    else 止帧 = 时刻帧(d.止 as 时刻<扩展>, 表, 轴);
    if (!Number.isInteger(止帧) || 止帧 <= 起帧) throw new Error(`${名} 的窗口 [${起帧}, ${止帧}) 是空的或反了`);
    if (起帧 < 0 || 止帧 > 末帧) throw new Error(`${名} 的窗口 [${起帧}, ${止帧}) 超出时间轴（0 到第 ${末帧} 帧）`);
    r.push({ 名: d.名, 串: 串.名, 起帧, 止帧, 帧数: 止帧 - 起帧, 依据: d.依据 ?? '' });
  }
  return r;
};
