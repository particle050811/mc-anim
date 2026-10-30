// 老场接新段的适配层：老段（定义段 手写帧数，没有 定义场时间线 做的场时间线，如应力转动第 6、7 章）一个不改，
// 在 场/<场键>/时间线.ts 里把它们按清单顺序首尾相接摆上一条场时间线，事件 `<段键>.起`、`<段键>.止`；新段（窗口段）从这条线取窗口、写跨段的场声音。纯模块。
// 老段的 段.ts 是纯模块，这里只读它的 帧数、场窗口、fps、画幅。老场自己的时间线文件（如 地点/古城4x/7-1/时间线.ts）闭包里有 asset:，进不了纯模块，所以不引它。
import type { 段定义 } from './段定义.ts';
import type { 事件定义 } from './时间线.ts';
import { 定义场时间线, type 场声音定义, type 场时间线 } from './窗口段.ts';

/** 一个老段：段键（事件名用）、它的 段.ts 默认导出；起帧 不给就接在前一个老段的止帧上（有 场窗口 的照 场窗口） */
export type 老段 = { 键: string; 段: 段定义; 起帧?: number };

export type 老段事件<K extends string> = `${K}.起` | `${K}.止`;

/**
 * 老段摆成的场时间线。fps、画幅取老段的（要一致）；事件 里可以再加新段要用的事件，接在 `<段键>.止` 上。
 * 声音、时长同 定义场时间线。老段本身不读这条线，场声音只放进新段。
 */
export const 接老段 = <const K extends string, const E extends string = never, 扩展 = never>(d: {
  场: string;
  老段: readonly (老段 & { 键: K })[];
  事件?: Readonly<Record<E, 事件定义<扩展>>>;
  解析?: (t: 扩展) => number;
  声音?: readonly 场声音定义<NoInfer<老段事件<K> | E>, 扩展>[];
  时长?: number;
}): 场时间线<老段事件<K> | E, 扩展> => {
  if (!d.老段.length) throw new Error(`场 ${d.场}：接老段 要至少一个老段`);
  const 头 = d.老段[0]!.段;
  const 老事件: Record<string, 事件定义<扩展>> = {};
  let 上止 = 0;
  for (const x of d.老段) {
    const s = x.段;
    if (s.场 !== d.场) throw new Error(`${x.键} 是场 ${s.场} 的段，不在 ${d.场}`);
    if (s.fps !== 头.fps || s.宽 !== 头.宽 || s.高 !== 头.高) throw new Error(`${x.键} 的 fps、画幅（${s.fps}，${s.宽}×${s.高}）和 ${d.老段[0]!.键} 不一样，摆不上同一条场时间线`);
    if (`${x.键}.起` in 老事件) throw new Error(`老段 ${x.键} 列了两次`);
    const 起 = x.起帧 ?? s.场窗口?.起帧 ?? 上止;
    if (!Number.isInteger(起) || 起 < 0) throw new Error(`${x.键} 的起帧要是非负整数：${起}`);
    老事件[`${x.键}.起`] = { 在: { 帧: 起 }, 依据: '老段（定义段），按清单顺序首尾相接' };
    老事件[`${x.键}.止`] = { 在: { 帧: 起 + s.帧数 }, 依据: '老段（定义段），按清单顺序首尾相接' };
    上止 = 起 + s.帧数;
  }
  for (const k of Object.keys(d.事件 ?? {})) if (k in 老事件) throw new Error(`事件「${k}」和老段的事件重名`);
  return 定义场时间线({
    场: d.场,
    fps: 头.fps,
    画幅: { 宽: 头.宽, 高: 头.高 },
    事件: { ...老事件, ...(d.事件 ?? {}) } as Record<老段事件<K> | E, 事件定义<扩展>>,
    ...(d.解析 ? { 解析: d.解析 } : {}),
    ...(d.声音 ? { 声音: d.声音 } : {}),
    ...(d.时长 !== undefined ? { 时长: d.时长 } : {}),
  });
};
