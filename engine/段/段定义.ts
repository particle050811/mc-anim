// 段.ts 的形状：纯数据（pipeline 直接 import，闭包里不许有 react、three、remotion），画面.tsx 负责画。
import { interpTable } from './按时取值.ts';

// 时间一律是秒（用户 11-06 定原生 60 帧、段.ts 直接写秒，docs/决策/0015-原生60帧.md）：段长、cue 的起点、长度、入点、淡出都是秒，带小数，不对齐到任何帧网格。
// 段长对齐到 1/段格 秒（60 帧一格）：成片按 60 帧接，各段首帧都落在段起点上，没有零头。画面按秒取时间（engine/段/时间.tsx），声音和画面同一遍出。
// 宽高是 Composition 的页面尺寸，成片 2K 靠渲染时 scale 2（旧项目 渲染级别.ts：改宽高会让体素世界换细一级，所以不改宽高）。

/** 段长对齐的格：段长 × 段格 是整数（写到毫秒的段长先四舍五入到格上） */
export const segFps = 60;
/** 秒数比较的容差：段.ts 里的秒写到毫秒，差半毫秒以内算一样 */
const msTolerance = 5e-4 + 1e-9;

/** 台词 cue：开口落在段内第 秒 秒（文件头 = 秒 − 作品的 台词.toml 里的 开口秒，在段开头之前的从文件里跳过）。
 *  接上段：这句前面已经开口（本段前面那条，或清单里上一段），从本段第 秒 秒接着放，前一截放到这一刻为止；不算一次「用到」。
 *  长秒：放几秒（截断）；不写按配音放完再多 台词尾余秒（旧 台词轨.tsx 的「多 1 帧」），都截到段尾 */
export type LineCue = { sec: number; lines: string; 接上段?: true; 长秒?: number; asset?: undefined };
/** 逐格增益：第 i 项是起放后第 i ÷ 每秒 秒那一刻的值，格之间线性插值（按时取值.ts 的 interpTable）。第 6、7 章照母版一帧一个值，每秒 24 */
export type PerCellGain = { perSec: number; value: readonly number[] };
/** 音效、配乐 cue（资产 id 以 配乐/ 开头的算配乐）：照母版里实际的放法（旧项目 exportSfx 收的 SfxClipLog）。
 *  秒：段内第几秒起放；长秒：放几秒（截断，含段尾）；入点秒：从文件第几秒放起；速率：变速变调；循环：放完绕回文件头；
 *  增益：乘到文件上的音量（含音效总线、距离衰减），一个数是整声都一样，逐格增益是随时间变；淡出秒：最后几秒线性淡到 0，只和一个数的 增益 配；
 *  名、档：片段名和名前标的档（engine/audio/混音.ts 的分档：重 −10、中 −20、脚步 −30，直接给响度的写数，细节）。增益是 6 位小数 */
export type AssetCue = {
  sec: number;
  asset: string;
  name: string;
  长秒: number;
  档?: string;
  入点秒?: number;
  速率?: number;
  循环?: true;
  增益?: number | PerCellGain;
  fadeOutSec?: number;
  /** 故意截在段尾的原因（pipeline/段框架/声音接缝.ts 不报）；不进混音 */
  cutReason?: string;
  lines?: undefined;
};
export type SoundCue = LineCue | AssetCue;

/** 台词不写 长秒 时放完配音再多放这么久（旧 台词轨.tsx 截到文件完多 1 帧，那时一帧 1/24 秒） */
export const lineTailSec = 1 / 24;

/** 段长（秒，落在 1/段格 的格上） */
export const segDurSec = (seg: Pick<SegmentDef, 'sec'>) => Math.round(seg.sec * segFps) / segFps;
/** 段在 fps 帧的输出上占几帧 */
export const segFrameCount = (seg: Pick<SegmentDef, 'sec'>, fps: number) => Math.round(segDurSec(seg) * fps);

/** 是不是逐格增益 */
export const isPerCell = (g: AssetCue['增益']): g is PerCellGain => typeof g === 'object' && g !== null;

/** 资产 cue 起放后第 t 秒的增益：逐格增益按格插值；常数带淡出的按 t 连续算 */
export const cueGain = (c: AssetCue, t: number) => {
  if (isPerCell(c.增益)) return interpTable(c.增益.value, t * c.增益.perSec);
  const g = c.增益 ?? 1;
  return c.fadeOutSec ? Math.round(g * Math.min(1, (c.长秒 - t) / c.fadeOutSec) * 1e6) / 1e6 : g;
};

/** 透明叠层：本段目录下 <入口>（叠层*.tsx）默认导出的透明底组件，登记成 Composition `<段键>-<名>`，长度、尺寸同本段，
 *  同一刻叠在本段上。只进成片（anim film 叠），不进单段母版：游戏 UI 的字和数字只给完整成片（旧项目 透明层.py） */
export type OverlayDef = { name: string; entry: string };

export type SegmentDef = {
  /** 所属场键（核对段写 核对；跨场的段写开头那场） */
  scene: string;
  /** 段长（秒）：落在 1/段格 秒的格上（写到毫秒的四舍五入到格） */
  sec: number;
  width: number;
  height: number;
  /** 用到的地形区段包名（assets/地形版本.json 里登记的）。版本进指纹，页面也只拿到这些包，读别的包直接报错（engine/voxel/区段包位置.ts） */
  terrain: readonly string[];
  /** 时钟是场窗口时：本段在场时间线上的 [起秒, 止秒) */
  sceneWindow?: { startSec: number; endSec: number };
  /** 和清单里同一场的上一段是同一个不切的镜头拆开的：本段起点正好接上一段的止（anim check 查） */
  continuous?: boolean;
  sound?: readonly SoundCue[];
  overlay?: readonly OverlayDef[];
};

export const defineSeg = (d: SegmentDef): SegmentDef => {
  if (!(d.sec > 0) || Math.abs(d.sec * segFps - Math.round(d.sec * segFps)) > segFps * msTolerance) throw new Error(`段长 ${d.sec} 秒要是正数、落在 1/${segFps} 秒的格上（写到毫秒）`);
  const segLengthSec = segDurSec(d);
  if (d.sceneWindow && Math.abs(d.sceneWindow.endSec - d.sceneWindow.startSec - segLengthSec) >= 1 / segFps) {
    throw new Error(`场窗口 [${d.sceneWindow.startSec}, ${d.sceneWindow.endSec}) 有 ${d.sceneWindow.endSec - d.sceneWindow.startSec} 秒，段长是 ${segLengthSec} 秒`);
  }
  if (d.continuous && !d.sceneWindow) throw new Error('标了 连续 的段要写 场窗口，才查得了和上一段接没接上');
  for (const c of d.sound ?? []) {
    if ((c.lines === undefined) === (c.asset === undefined)) throw new Error(`声音 cue（第 ${c.sec} 秒）要写 台词 或 资产，二选一`);
    const cueName = `声音 cue（第 ${c.sec} 秒 ${c.lines ?? c.asset}）`;
    // 开口可以早于段尾任意处；从哪一刻起放的（资产、接上段）连同长度都要在段内
    const inSegment = c.lines === undefined || c.接上段;
    if (!Number.isFinite(c.sec) || c.sec < 0 || c.sec >= segLengthSec) throw new Error(`${cueName}：秒要在段内 [0, ${segLengthSec})`);
    if (c.长秒 !== undefined && (!(c.长秒 > 0) || (inSegment && c.sec + c.长秒 > segLengthSec + msTolerance))) throw new Error(`${cueName}：长秒 ${c.长秒} 要是正数、不超过段尾`);
    if (c.lines !== undefined) continue;
    if (c.长秒 === undefined || !c.name) throw new Error(`${cueName}：资产 cue 要写 名、长秒`);
    if (c.速率 !== undefined && !(c.速率 > 0)) throw new Error(`${cueName}：速率要大于 0`);
    if (c.入点秒 !== undefined && !(c.入点秒 >= 0)) throw new Error(`${cueName}：入点秒不能是负的`);
    if (c.档 !== undefined && !/^((重|中|脚步) -\d+(\.\d+)?|细节|-?\d+(\.\d+)?)$/.test(c.档)) throw new Error(`${cueName}：档「${c.档}」要是「重 -10」「中 -20」「脚步 -30」「细节」或响度数`);
    if (isPerCell(c.增益)) {
      if (!(c.增益.perSec > 0) || !c.增益.value.length) throw new Error(`${cueName}：逐格增益要有 每秒（正数）和至少一个值`);
      // 场声音那截 按首尾两格都算给 长秒 × 每秒 + 1 个值，长秒的浮点误差（10.249999999999996）会多出一丝，容差留 1e-6
      if (Math.abs(c.增益.value.length - c.长秒 * c.增益.perSec) > 1 + 1e-6) throw new Error(`${cueName}：逐格增益 ${c.增益.value.length} 个（每秒 ${c.增益.perSec}），和长秒 ${c.长秒} 对不上`);
      if (c.fadeOutSec !== undefined) throw new Error(`${cueName}：逐格增益已经含淡出，不另写 淡出秒`);
    }
    if (c.fadeOutSec !== undefined && (!(c.fadeOutSec > 0) || c.fadeOutSec > c.长秒 + msTolerance)) throw new Error(`${cueName}：淡出秒 ${c.fadeOutSec} 要是正数、不超过长秒`);
  }
  const layerNames = new Set<string>();
  for (const l of d.overlay ?? []) {
    if (!/^叠层[^/]*\.tsx$/.test(l.entry)) throw new Error(`叠层 ${l.name} 的入口 ${l.entry} 要是本段目录下的 叠层*.tsx（作品的 注册.tsx 只收这个名字）`);
    // Remotion 的 Composition id 只认字母、数字、汉字和 -
    if (!/^[A-Za-z0-9一-鿿-]+$/.test(l.name) || layerNames.has(l.name)) throw new Error(`叠层名「${l.name}」重复，或不能当 Composition id（只能字母、数字、汉字和 -）`);
    layerNames.add(l.name);
  }
  return d;
};
