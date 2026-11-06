// 分镜的时间工具：全片「画面对歌」的时间轴和写法（fps、拍、小节、句、时刻、解事件、排段），不带具体事件。
// 事件和段窗口按串拆在本目录（用户 11-06 定按句拆，改一句只过期那几段；原来 10-22 定的单独一个文件不再当约束）：一串一个文件，接 到别的串的事件就只引那一份。
// 纯模块（段.ts 会 import），不许 import react、three、remotion。
// 时间轴就是整首歌：歌曲帧 0 = 原声 0 秒，歌曲帧 = Math.round(秒 × fps)，帧号只在这里由秒数取整一次；网格和句的起止从 配乐/网格.ts 来。
// 段的 场窗口、原声 cue 的入点和帧数、段里要卡的事件都从分镜取，段和画面里不写帧号字面量；段内帧 = 歌曲帧 − 段的起帧。
// 同一串里的段窗口首尾相接、各段原声 cue 的入点都由这里推，成片按样本接起来就和整条歌逐样本一致（48 kHz、60 fps 一帧正好 800 个样本）。
// 段、场、特效只引这里和用得到的那几串，不引汇总的 ../分镜.ts（那份只给测试用）。
import { 句们, 网格, type 句 } from '../配乐/网格.ts';

/** 一秒几帧：用户 11-02 定从 24 换成 60（粉丝嫌不够流畅）。分寸一律按秒，帧号由秒 × fps 现算，换 fps 不改快慢和时长 */
export const fps = 60;
/** 24 fps 时 n 帧是几秒（n ÷ 24）：11-02 以前按帧调的时长（「闪白 5 帧」）照这个换成秒，秒数一点不变 */
export const 旧帧 = (n: number) => n / 24;
/** 一帧几秒：「起那一帧已经走了一帧」「提前一帧」这类按帧的分寸用它。原来写 旧帧(1)，60 fps 下等于先跳 2.5 帧（用户 11-03「统统改成 60 帧」） */
export const 一帧秒 = 1 / fps;

/** 画幅 16:9，不做竖版（用户 10-22 定）：页面 1280×720，成片渲染时 scale 2 出 2560×1440 */
export const 画幅 = { 宽: 1280, 高: 720 } as const;

export const 歌曲帧 = (秒: number) => Math.round(秒 * fps);
/** 第 n 拍的秒数 */
export const 拍 = (n: number) => 网格.首拍 + 网格.拍长 * n;
/** 第 k 小节下拍的秒数（奇数小节是乐句下拍，偶数小节是断拍回落） */
export const 小节下拍 = (k: number) => 拍(网格.每小节拍数 * k);
export const 第几句 = (序: number): 句 => {
  const s = 句们.find((x) => x.序 === 序);
  if (!s) throw new Error(`配乐/网格.ts 里没有第 ${序} 句`);
  return s;
};

/** 歌上的一个时刻。秒：直接给秒数；拍、小节：网格上的拍；
 *  句：第几句的 前导、起、止，开口 = 第一个出声的地方（有前导音取前导，没有取起）；
 *  接：表里另一个事件再往后几秒（负数往前） */
export type 时刻 =
  | { 秒: number }
  | { 拍: number }
  | { 小节: number }
  | { 句: number; 点: '前导' | '起' | '止' | '开口' }
  | { 接: string; 加秒: number };

export type 事件定义 = { 在: 时刻; 依据: string };

// 段里要卡的事件，各串按时间排。「暂定」「演绎」的是 Agent 排的，用户没看过；原版的寿命按 20 刻一秒换成秒
// 依据和核查记录里写的「n 帧」都是 11-02 以前 24 fps 的帧（n/24 秒），换 60 fps 时没改字
// 正片（章 2）的时刻照三稿逐句画面（预览/1024-0233-正片三版三稿-歌词与画面/00-说明.md）。三稿写的秒数是句起的写成句，落在网格拍上（差不到 0.01 秒）的写成拍。
// 第 8 句：开口 = 句，25.67 = 第 60 拍 … 28.23 = 第 66 拍。第 13 句分屏：41.87 = 第 98 拍 … 44.42 = 第 104 拍。第 15 句：48.61 = 句起，49.96 = 第 117 拍

export type 歌上事件 = { 秒: number; 帧: number; 依据: string };

/** 时刻 → 秒；接 按名字去 表 里找（可以接在后面才写的事件上，接成环就报错） */
export const 解时刻 = (t: 时刻, 表: Readonly<Record<string, 事件定义>>, 路: readonly string[] = []): number => {
  if ('秒' in t) return t.秒;
  if ('拍' in t) return 拍(t.拍);
  if ('小节' in t) return 小节下拍(t.小节);
  if ('句' in t) {
    const s = 第几句(t.句);
    if (t.点 === '前导' && s.前导 === undefined) throw new Error(`第 ${t.句} 句没有前导音`);
    return t.点 === '开口' ? (s.前导 ?? s.起) : t.点 === '前导' ? s.前导! : s[t.点];
  }
  const 被接 = 表[t.接];
  if (!被接) throw new Error(`接的事件「${t.接}」不在表里`);
  if (路.includes(t.接)) throw new Error(`事件接成了环：${[...路, t.接].join(' → ')}`);
  return 解时刻(被接.在, 表, [...路, t.接]) + t.加秒;
};

/** 解出 表 里每个事件；接 到 表 外的事件去 查表 里找（查表 = 本串的加上引来的那几串的） */
export const 解事件 = <K extends string>(表: Readonly<Record<K, 事件定义>>, 查表: Readonly<Record<string, 事件定义>> = 表): Record<K, 歌上事件> => {
  const r = {} as Record<K, 歌上事件>;
  for (const 名 of Object.keys(表) as K[]) {
    const 秒 = 解时刻(表[名].在, 查表, [名]);
    r[名] = { 秒, 帧: 歌曲帧(秒), 依据: 表[名].依据 };
  }
  return r;
};

/** 每个事件在这一段里的段内帧（不在这段里的也照算，会是负数或不小于帧数） */
export const 段内帧 = <K extends string>(起帧: number, 事件: Readonly<Record<K, 歌上事件>>): Record<K, number> => {
  const r = {} as Record<K, number>;
  for (const 名 of Object.keys(事件) as K[]) r[名] = 事件[名].帧 - 起帧;
  return r;
};

// ---------- 段窗口 ----------

/** 段窗口的止：歌上的一个时刻、按画面长度给帧数（歌只是接着往下放），或 放完 = 原声最后一个整帧 */
export type 窗口止 = 时刻 | { 帧数: number } | '放完';
/** 串里第一段要写 起；后面的段不写就接上一段的止，写了就要正好等于上一段的止 */
export type 段窗口定义 = { 键: string; 起?: 时刻; 止: 窗口止; 依据: string };
/** 一串：同一首歌上连着放的几段（歌在串里不切开） */
export type 串定义 = { 名: string; 时长: number; 段们: readonly 段窗口定义[] };
export type 段窗口 = { 键: string; 串: string; 起帧: number; 止帧: number; 帧数: number; 依据: string };

/** 推出一串里每段的窗口（歌曲帧 [起帧, 止帧)），并查首尾相接、不重叠、不超出原声；接 去 表 里找 */
export const 排段 = (串: 串定义, 表: Readonly<Record<string, 事件定义>> = {}): 段窗口[] => {
  const r: 段窗口[] = [];
  const 末帧 = Math.floor(串.时长 * fps + 1e-9);
  for (const d of 串.段们) {
    const 名 = `串「${串.名}」的 ${d.键}`;
    if (r.some((w) => w.键 === d.键)) throw new Error(`${名} 出现了两次`);
    const 上 = r.at(-1);
    let 起帧: number;
    if (d.起) {
      起帧 = 歌曲帧(解时刻(d.起, 表));
      if (上 && 起帧 !== 上.止帧) throw new Error(`${名} 起在第 ${起帧} 帧，上一段 ${上.键} 止在第 ${上.止帧} 帧：${起帧 > 上.止帧 ? '中间空了' : '重叠了'} ${Math.abs(起帧 - 上.止帧)} 帧`);
    } else if (上) 起帧 = 上.止帧;
    else throw new Error(`${名} 是串里第一段，要写 起`);
    const 止帧 = d.止 === '放完' ? 末帧 : '帧数' in d.止 ? 起帧 + d.止.帧数 : 歌曲帧(解时刻(d.止, 表));
    if (!Number.isInteger(止帧) || 止帧 <= 起帧) throw new Error(`${名} 的窗口 [${起帧}, ${止帧}) 是空的或反了`);
    if (起帧 < 0 || 止帧 > 末帧) throw new Error(`${名} 的窗口 [${起帧}, ${止帧}) 超出原声（0 到第 ${末帧} 帧）`);
    r.push({ 键: d.键, 串: 串.名, 起帧, 止帧, 帧数: 止帧 - 起帧, 依据: d.依据 });
  }
  return r;
};

/** 段.ts 用：段长（秒，和本作品的帧数）、场窗口（秒）、起帧（歌曲帧，画面里换算用），和原声 cue 的 秒、长秒、入点秒（cue 的 资产、名、增益由段补上）。
 *  段.ts 只认秒（engine/段/段定义.ts）；本作品 60 帧一格，正好是段长对齐的格，换成秒不丢东西 */
export const 窗口时钟 = (w: 段窗口) => ({
  帧数: w.帧数,
  起帧: w.起帧,
  秒: w.帧数 / fps,
  场窗口: { 起秒: w.起帧 / fps, 止秒: w.止帧 / fps },
  原声: { 秒: 0, 长秒: w.帧数 / fps, 入点秒: w.起帧 / fps },
});

/** 一串的按段键查法：只查这一串，别的串的段键报错（各串文件导出的 段窗口、段时钟） */
export const 串查法 = (串: readonly 段窗口[]) => {
  const 段窗口 = (键: string): 段窗口 => {
    const w = 串.find((x) => x.键 === 键);
    if (!w) throw new Error(`分镜串「${串[0]?.串}」里没有段 ${键} 的窗口`);
    return w;
  };
  return { 段窗口, 段时钟: (键: string) => 窗口时钟(段窗口(键)) };
};
