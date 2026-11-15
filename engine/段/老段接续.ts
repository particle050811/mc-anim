// 老场接新段的适配层：老段（定义段 手写段长，没有 定义场时间线 做的场时间线，如应力转动第 6、7 章）一个不改，
// 在 场/<场键>/时间线.ts 里把它们按清单顺序首尾相接摆上一条场时间线，事件 `<段键>.起`、`<段键>.止`；新段（窗口段）从这条线取窗口、写跨段的场声音。纯模块。
// 老段的段长抄成数写在这里，不 import 老段的 段.ts：场不许引段（分层），老场自己的时间线文件（如 地点/古城4x/7-1/时间线.ts）闭包里有 asset:，也进不了纯模块。
// 抄的数由 anim new seg 照老段写，anim check 的「加载」逐个和老段的 段.ts 对（pipeline/段框架/核对.ts 的 查老段接续）。
import type { EventDef } from './时间线.ts';
import { defineSceneTimeline, type SceneSoundDef, type SceneTimeline } from './窗口段.ts';

/** 一个老段：段键（事件名用）、段长秒；起秒 不给就接在前一个老段的止上（老时间线里段间跳过一截的手给） */
export type LegacySeg = { 键: string; 秒: number; startSec?: number };

export type LegacySegEvent<K extends string> = `${K}.起` | `${K}.止`;

/** 接老段 做的场时间线多带一张老段表（解出的起秒），anim check 拿它和老段的 段.ts 对 */
export type ContinueOldSegTimeline<K extends string, Ext> = SceneTimeline<K, Ext> & { legacySegs: readonly { 键: string; startSec: number; 秒: number }[] };

/**
 * 老段摆成的场时间线。画幅要和老段的一样（不给就是 默认段格式）；事件 里可以再加新段要用的事件，接在 `<段键>.止` 上。
 * 声音、时长同 定义场时间线。老段本身不读这条线，场声音只放进新段。
 */
export const continueOldSeg = <const K extends string, const E extends string = never, Ext = never>(d: {
  场: string;
  legacySegs: readonly (LegacySeg & { 键: K })[];
  事件?: Readonly<Record<E, EventDef<Ext>>>;
  aspect?: { 宽: number; 高: number };
  resolveTime?: (t: Ext) => number;
  声音?: readonly SceneSoundDef<NoInfer<LegacySegEvent<K> | E>, Ext>[];
  时长?: number;
}): ContinueOldSegTimeline<LegacySegEvent<K> | E, Ext> => {
  if (!d.legacySegs.length) throw new Error(`场 ${d.场}：接老段 要至少一个老段`);
  const legacyEvents: Record<string, EventDef<Ext>> = {};
  const segmentTable: { 键: string; startSec: number; 秒: number }[] = [];
  let prevEnd = 0;
  for (const x of d.legacySegs) {
    if (`${x.键}.起` in legacyEvents) throw new Error(`老段 ${x.键} 列了两次`);
    const startSec = x.startSec ?? prevEnd;
    if (!(startSec >= 0)) throw new Error(`${x.键} 的起秒不能是负的：${startSec}`);
    if (!(x.秒 > 0)) throw new Error(`${x.键} 的段长要是正数：${x.秒}`);
    legacyEvents[`${x.键}.起`] = { 在: { 秒: startSec }, 依据: '老段（定义段），按清单顺序首尾相接' };
    legacyEvents[`${x.键}.止`] = { 在: { 秒: startSec + x.秒 }, 依据: '老段（定义段），按清单顺序首尾相接' };
    segmentTable.push({ 键: x.键, startSec: startSec, 秒: x.秒 });
    prevEnd = startSec + x.秒;
  }
  for (const k of Object.keys(d.事件 ?? {})) if (k in legacyEvents) throw new Error(`事件「${k}」和老段的事件重名`);
  const timeline = defineSceneTimeline({
    场: d.场,
    ...(d.aspect ? { aspect: d.aspect } : {}),
    事件: { ...legacyEvents, ...(d.事件 ?? {}) } as Record<LegacySegEvent<K> | E, EventDef<Ext>>,
    ...(d.resolveTime ? { resolveTime: d.resolveTime } : {}),
    ...(d.声音 ? { 声音: d.声音 } : {}),
    ...(d.时长 !== undefined ? { 时长: d.时长 } : {}),
  });
  return { ...timeline, legacySegs: segmentTable };
};

/** 老段表和老段的 段.ts 对不对得上（anim check 用）：段长、场、画幅。返回问题列表 */
export const checkOldSeg = (
  timeline: Pick<ContinueOldSegTimeline<string, unknown>, '场' | '宽' | '高' | 'legacySegs'>,
  segAt: (segKey: string) => { 场: string; 秒: number; 宽: number; 高: number } | undefined,
): string[] =>
  timeline.legacySegs.flatMap((x) => {
    const s = segAt(x.键);
    if (!s) return [`老段 ${x.键} 不在清单里`];
    const issues: string[] = [];
    if (Math.abs(s.秒 - x.秒) > 5e-4) issues.push(`老段 ${x.键} 的段长：时间线里抄的 ${x.秒} 秒，段.ts 里 ${s.秒} 秒`);
    if (s.场 !== timeline.场) issues.push(`老段 ${x.键} 是场 ${s.场} 的段，不在 ${timeline.场}`);
    if (s.宽 !== timeline.宽 || s.高 !== timeline.高) issues.push(`老段 ${x.键} 的画幅（${s.宽}×${s.高}）和场时间线（${timeline.宽}×${timeline.高}）不一样`);
    return issues;
  });
