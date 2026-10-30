// 新段的工厂：场时间线 + 窗口段。纯模块（段.ts、场的 时间线.ts 用）。
// 段 = 场时间线上 [起, 止) 这一截（docs/架构.md「新章节一律用场窗口」）。段.ts 里不写段键、帧数、fps、画幅：段键只在目录名（和清单）里，
// 帧数由窗口推，fps、画幅取时间线的（不给就是 默认段格式）。声音 cue 用 声音助手.ts 的 放、说 写一次，画面那头 <段声音> 照表放（段画面.tsx）。
// 旧段（定义段 手写的）不用改；这里返回的仍是 段定义，pipeline 照常读。
import { 定义段, type 段定义, type 声音cue, type 叠层定义 } from './段定义.ts';
import { 做声音助手, type 声音助手, type 声音表 } from './声音助手.ts';
import { 时刻帧, 解事件, type 事件定义, type 时刻, type 解出事件 } from './时间线.ts';

/** 两部作品现在都是 24 fps、页面 1280×720（成片渲染 scale 2 出 2K，见 段定义.ts 文件头） */
export const 默认段格式 = { fps: 24, 宽: 1280, 高: 720 } as const;

export type 场时间线<K extends string = string, 扩展 = never> = {
  场: string;
  fps: number;
  宽: number;
  高: number;
  /** 事件在场时间线上的秒和帧 */
  事件: Readonly<Record<K, 解出事件>>;
  /** 原始定义（接、扩展时刻在段里再解时要用） */
  定义: Readonly<Record<K, 事件定义<扩展>>>;
  解析?: (t: 扩展) => number;
  /** 场时间线总长（秒），给了就查窗口不超出 */
  时长?: number;
};

/** 一条场时间线：场键、事件表；fps、画幅不给就用 默认段格式。扩展时刻（如 歌网格.ts 的拍、句）给 解析 */
export const 定义场时间线 = <const K extends string, 扩展 = never>(d: {
  场: string;
  事件: Readonly<Record<K, 事件定义<扩展>>>;
  fps?: number;
  画幅?: { 宽: number; 高: number };
  解析?: (t: 扩展) => number;
  时长?: number;
}): 场时间线<K, 扩展> => {
  const fps = d.fps ?? 默认段格式.fps;
  return {
    场: d.场,
    fps,
    宽: d.画幅?.宽 ?? 默认段格式.宽,
    高: d.画幅?.高 ?? 默认段格式.高,
    事件: 解事件(d.事件, { fps, 解析: d.解析 }),
    定义: d.事件,
    解析: d.解析,
    时长: d.时长,
  };
};

/** 窗口的端点：事件名，或直接给时刻（接 也能接事件名） */
export type 端点<K extends string, 扩展> = K | 时刻<扩展>;

/** 给 声音 回调的：放、说、接着说，和各事件的段内帧 */
export type 段声音参数<K extends string> = 声音助手 & { 事件: Readonly<Record<K, number>>; 帧数: number; fps: number };

export type 窗口段定义<K extends string = string> = 段定义 & {
  场窗口: { 起帧: number; 止帧: number };
  /** 各事件在本段里的段内帧（不在本段的也照算，会是负数或不小于帧数） */
  事件帧: Readonly<Record<K, number>>;
  /** 标记段框架做的段：画面用 段画面.tsx 的 定义画面，anim cues 给它生成声音表、地址表 */
  框架: '窗口段';
};

/**
 * 场时间线上 [起, 止) 这一截。止 也可以写 { 帧数 }。
 * 声音：回调里用 放、说 写 cue（时长、峰值取 声音表；声音表 是本段目录里 anim cues 生成的 声音表.生成.ts 的默认导出）。
 */
export const 窗口段 = <K extends string, 扩展 = never>(
  线: 场时间线<K, 扩展>,
  d: {
    起: 端点<K, 扩展>;
    止: 端点<K, 扩展> | { 帧数: number };
    声音表?: 声音表;
    声音?: (p: 段声音参数<K>) => readonly 声音cue[];
    地形?: readonly string[];
    连续?: boolean;
    叠层?: readonly 叠层定义[];
    /** 报错里认段用的名字（可选；不写报错里就说「本段」） */
    名?: string;
  },
): 窗口段定义<K> => {
  const 轴 = { fps: 线.fps, 解析: 线.解析 };
  const 帧于 = (e: 端点<K, 扩展>): number => (typeof e === 'string' ? 事件帧于(线, e as K) : 时刻帧(e, 线.定义, 轴));
  const 起帧 = 帧于(d.起);
  const 止帧 = typeof d.止 === 'object' && d.止 !== null && '帧数' in d.止 ? 起帧 + d.止.帧数 : 帧于(d.止 as 端点<K, 扩展>);
  const 名 = d.名 ?? '本段';
  if (!(止帧 > 起帧)) throw new Error(`${名}的窗口 [${起帧}, ${止帧}) 是空的或反了`);
  if (起帧 < 0) throw new Error(`${名}的窗口起在第 ${起帧} 帧，场时间线从 0 起`);
  if (线.时长 !== undefined && 止帧 > Math.floor(线.时长 * 线.fps + 1e-9)) throw new Error(`${名}的窗口止在第 ${止帧} 帧，超出场时间线（${线.时长} 秒）`);
  const 帧数 = 止帧 - 起帧;
  const 事件帧 = Object.fromEntries(Object.entries<解出事件>(线.事件).map(([k, v]) => [k, v.帧 - 起帧])) as Record<K, number>;
  const 助手 = 做声音助手({ fps: 线.fps, 帧数, 表: d.声音表, 段名: d.名 });
  const 声音 = d.声音?.({ ...助手, 事件: 事件帧, 帧数, fps: 线.fps });
  const 段 = 定义段({
    场: 线.场,
    帧数,
    fps: 线.fps,
    宽: 线.宽,
    高: 线.高,
    地形: d.地形 ?? [],
    场窗口: { 起帧, 止帧 },
    ...(d.连续 ? { 连续: true } : {}),
    ...(声音 ? { 声音 } : {}),
    ...(d.叠层 ? { 叠层: d.叠层 } : {}),
  });
  return { ...段, 场窗口: { 起帧, 止帧 }, 事件帧, 框架: '窗口段' };
};

const 事件帧于 = <K extends string, 扩展>(线: 场时间线<K, 扩展>, 名: K) => {
  const e = 线.事件[名];
  if (!e) throw new Error(`场 ${线.场} 的时间线里没有事件「${名}」`);
  return e.帧;
};

/** 是不是段框架做的段（pipeline 按这个决定要不要给它生成声音表、地址表）；以后别的工厂也写 框架 字段 */
export const 是框架段 = (段: 段定义): boolean => typeof (段 as { 框架?: unknown }).框架 === 'string';
