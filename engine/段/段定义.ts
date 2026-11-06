// 段.ts 的形状：纯数据（pipeline 直接 import，闭包里不许有 react、three、remotion），画面.tsx 负责画。
import { 插表 } from './按时取值.ts';

// 时间一律是秒（用户 11-06 定原生 60 帧、段.ts 直接写秒，docs/决策/0015-原生60帧.md）：段长、cue 的起点、长度、入点、淡出都是秒，带小数，不对齐到任何帧网格。
// 段长对齐到 1/段格 秒（60 帧一格）：成片按 60 帧接，各段首帧都落在段起点上，没有零头。画面按秒取时间（engine/段/时间.tsx），声音和画面同一遍出。
// 宽高是 Composition 的页面尺寸，成片 2K 靠渲染时 scale 2（旧项目 渲染级别.ts：改宽高会让体素世界换细一级，所以不改宽高）。

/** 段长对齐的格：段长 × 段格 是整数（写到毫秒的段长先四舍五入到格上） */
export const 段格 = 60;
/** 秒数比较的容差：段.ts 里的秒写到毫秒，差半毫秒以内算一样 */
const 毫秒容差 = 5e-4 + 1e-9;

/** 台词 cue：开口落在段内第 秒 秒（文件头 = 秒 − 作品的 台词.toml 里的 开口秒，在段开头之前的从文件里跳过）。
 *  接上段：这句前面已经开口（本段前面那条，或清单里上一段），从本段第 秒 秒接着放，前一截放到这一刻为止；不算一次「用到」。
 *  长秒：放几秒（截断）；不写按配音放完再多 台词尾余秒（旧 台词轨.tsx 的「多 1 帧」），都截到段尾 */
export type 台词cue = { 秒: number; 台词: string; 接上段?: true; 长秒?: number; 资产?: undefined };
/** 逐格增益：第 i 项是起放后第 i ÷ 每秒 秒那一刻的值，格之间线性插值（按时取值.ts 的 插表）。第 6、7 章照母版一帧一个值，每秒 24 */
export type 逐格增益 = { 每秒: number; 值: readonly number[] };
/** 音效、配乐 cue（资产 id 以 配乐/ 开头的算配乐）：照母版里实际的放法（旧项目 exportSfx 收的 SfxClipLog）。
 *  秒：段内第几秒起放；长秒：放几秒（截断，含段尾）；入点秒：从文件第几秒放起；速率：变速变调；循环：放完绕回文件头；
 *  增益：乘到文件上的音量（含音效总线、距离衰减），一个数是整声都一样，逐格增益是随时间变；淡出秒：最后几秒线性淡到 0，只和一个数的 增益 配；
 *  名、档：片段名和名前标的档（engine/audio/混音.ts 的分档：重 −10、中 −20、脚步 −30，直接给响度的写数，细节）。增益是 6 位小数 */
export type 资产cue = {
  秒: number;
  资产: string;
  名: string;
  长秒: number;
  档?: string;
  入点秒?: number;
  速率?: number;
  循环?: true;
  增益?: number | 逐格增益;
  淡出秒?: number;
  台词?: undefined;
};
export type 声音cue = 台词cue | 资产cue;

/** 台词不写 长秒 时放完配音再多放这么久（旧 台词轨.tsx 截到文件完多 1 帧，那时一帧 1/24 秒） */
export const 台词尾余秒 = 1 / 24;

/** 段长（秒，落在 1/段格 的格上） */
export const 段长秒 = (段: Pick<段定义, '秒'>) => Math.round(段.秒 * 段格) / 段格;
/** 段在 fps 帧的输出上占几帧 */
export const 段帧数 = (段: Pick<段定义, '秒'>, fps: number) => Math.round(段长秒(段) * fps);

/** 是不是逐格增益 */
export const 是逐格 = (g: 资产cue['增益']): g is 逐格增益 => typeof g === 'object' && g !== null;

/** 资产 cue 起放后第 t 秒的增益：逐格增益按格插值；常数带淡出的按 t 连续算 */
export const cue增益 = (c: 资产cue, t: number) => {
  if (是逐格(c.增益)) return 插表(c.增益.值, t * c.增益.每秒);
  const g = c.增益 ?? 1;
  return c.淡出秒 ? Math.round(g * Math.min(1, (c.长秒 - t) / c.淡出秒) * 1e6) / 1e6 : g;
};

/** 透明叠层：本段目录下 <入口>（叠层*.tsx）默认导出的透明底组件，登记成 Composition `<段键>-<名>`，长度、尺寸同本段，
 *  同一刻叠在本段上。只进成片（anim film 叠），不进单段母版：游戏 UI 的字和数字只给完整成片（旧项目 透明层.py） */
export type 叠层定义 = { 名: string; 入口: string };

export type 段定义 = {
  /** 所属场键（核对段写 核对；跨场的段写开头那场） */
  场: string;
  /** 段长（秒）：落在 1/段格 秒的格上（写到毫秒的四舍五入到格） */
  秒: number;
  宽: number;
  高: number;
  /** 用到的地形区段包名（assets/地形版本.json 里登记的）。版本进指纹，页面也只拿到这些包，读别的包直接报错（engine/voxel/区段包位置.ts） */
  地形: readonly string[];
  /** 时钟是场窗口时：本段在场时间线上的 [起秒, 止秒) */
  场窗口?: { 起秒: number; 止秒: number };
  /** 和清单里同一场的上一段是同一个不切的镜头拆开的：本段起点正好接上一段的止（anim check 查） */
  连续?: boolean;
  声音?: readonly 声音cue[];
  叠层?: readonly 叠层定义[];
};

export const 定义段 = (d: 段定义): 段定义 => {
  if (!(d.秒 > 0) || Math.abs(d.秒 * 段格 - Math.round(d.秒 * 段格)) > 段格 * 毫秒容差) throw new Error(`段长 ${d.秒} 秒要是正数、落在 1/${段格} 秒的格上（写到毫秒）`);
  const 长 = 段长秒(d);
  if (d.场窗口 && Math.abs(d.场窗口.止秒 - d.场窗口.起秒 - 长) >= 1 / 段格) {
    throw new Error(`场窗口 [${d.场窗口.起秒}, ${d.场窗口.止秒}) 有 ${d.场窗口.止秒 - d.场窗口.起秒} 秒，段长是 ${长} 秒`);
  }
  if (d.连续 && !d.场窗口) throw new Error('标了 连续 的段要写 场窗口，才查得了和上一段接没接上');
  for (const c of d.声音 ?? []) {
    if ((c.台词 === undefined) === (c.资产 === undefined)) throw new Error(`声音 cue（第 ${c.秒} 秒）要写 台词 或 资产，二选一`);
    const 名 = `声音 cue（第 ${c.秒} 秒 ${c.台词 ?? c.资产}）`;
    // 开口可以早于段尾任意处；从哪一刻起放的（资产、接上段）连同长度都要在段内
    const 在段内 = c.台词 === undefined || c.接上段;
    if (!Number.isFinite(c.秒) || c.秒 < 0 || c.秒 >= 长) throw new Error(`${名}：秒要在段内 [0, ${长})`);
    if (c.长秒 !== undefined && (!(c.长秒 > 0) || (在段内 && c.秒 + c.长秒 > 长 + 毫秒容差))) throw new Error(`${名}：长秒 ${c.长秒} 要是正数、不超过段尾`);
    if (c.台词 !== undefined) continue;
    if (c.长秒 === undefined || !c.名) throw new Error(`${名}：资产 cue 要写 名、长秒`);
    if (c.速率 !== undefined && !(c.速率 > 0)) throw new Error(`${名}：速率要大于 0`);
    if (c.入点秒 !== undefined && !(c.入点秒 >= 0)) throw new Error(`${名}：入点秒不能是负的`);
    if (c.档 !== undefined && !/^((重|中|脚步) -\d+(\.\d+)?|细节|-?\d+(\.\d+)?)$/.test(c.档)) throw new Error(`${名}：档「${c.档}」要是「重 -10」「中 -20」「脚步 -30」「细节」或响度数`);
    if (是逐格(c.增益)) {
      if (!(c.增益.每秒 > 0) || !c.增益.值.length) throw new Error(`${名}：逐格增益要有 每秒（正数）和至少一个值`);
      if (Math.abs(c.增益.值.length - c.长秒 * c.增益.每秒) > 1) throw new Error(`${名}：逐格增益 ${c.增益.值.length} 个（每秒 ${c.增益.每秒}），和长秒 ${c.长秒} 对不上`);
      if (c.淡出秒 !== undefined) throw new Error(`${名}：逐格增益已经含淡出，不另写 淡出秒`);
    }
    if (c.淡出秒 !== undefined && (!(c.淡出秒 > 0) || c.淡出秒 > c.长秒 + 毫秒容差)) throw new Error(`${名}：淡出秒 ${c.淡出秒} 要是正数、不超过长秒`);
  }
  const 层名 = new Set<string>();
  for (const l of d.叠层 ?? []) {
    if (!/^叠层[^/]*\.tsx$/.test(l.入口)) throw new Error(`叠层 ${l.名} 的入口 ${l.入口} 要是本段目录下的 叠层*.tsx（作品的 注册.tsx 只收这个名字）`);
    // Remotion 的 Composition id 只认字母、数字、汉字和 -
    if (!/^[A-Za-z0-9一-鿿-]+$/.test(l.名) || 层名.has(l.名)) throw new Error(`叠层名「${l.名}」重复，或不能当 Composition id（只能字母、数字、汉字和 -）`);
    层名.add(l.名);
  }
  return d;
};
