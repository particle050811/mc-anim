// 老场接新段的适配层：老段（defineSeg 手写段长，没有 defineSceneTimeline 做的场时间线，如应力转动第 6、7 章）一个不改，
// 在 场/<场键>/时间线.ts 里把它们按清单顺序首尾相接摆上一条场时间线，事件 `<段键>.起`、`<段键>.止`；新段（窗口段）从这条线取窗口、写跨段的场声音。纯模块。
// 老段的段长抄成数写在这里，不 import 老段的 段.ts：场不许引段（分层），老场自己的时间线文件（如 地点/古城4x/7-1/时间线.ts）闭包里有 asset:，也进不了纯模块。
// 抄的数由 anim new seg 照老段写，anim check 的「加载」逐个和老段的 段.ts 对（pipeline/段框架/核对.ts 的 checkOldSeg）。
import type { EventDef } from './时间线.ts';
import { defineSceneTimeline, type SceneSoundDef, type SceneTimeline } from './窗口段.ts';

/** 一个老段：段键（事件名用）、段长秒；起秒 不给就接在前一个老段的止上（老时间线里段间跳过一截的手给） */
export type LegacySeg = { key: string; sec: number; startSec?: number };

export type LegacySegEvent<K extends string> = `${K}.起` | `${K}.止`;

/** continueOldSeg 做的场时间线多带一张老段表（解出的起秒），anim check 拿它和老段的 段.ts 对 */
export type ContinueOldSegTimeline<K extends string, Ext> = SceneTimeline<K, Ext> & { legacySegs: readonly { key: string; startSec: number; sec: number }[] };

/**
 * 老段摆成的场时间线。画幅要和老段的一样（不给就是 defaultSegFormat）；事件 里可以再加新段要用的事件，接在 `<段键>.止` 上。
 * 声音、时长同 defineSceneTimeline。老段本身不读这条线，场声音只放进新段。
 */
export const continueOldSeg = <const K extends string, const E extends string = never, Ext = never>(d: {
  scene: string;
  legacySegs: readonly (LegacySeg & { key: K })[];
  events?: Readonly<Record<E, EventDef<Ext>>>;
  aspect?: { width: number; height: number };
  resolveTime?: (t: Ext) => number;
  sound?: readonly SceneSoundDef<NoInfer<LegacySegEvent<K> | E>, Ext>[];
  duration?: number;
}): ContinueOldSegTimeline<LegacySegEvent<K> | E, Ext> => {
  if (!d.legacySegs.length) throw new Error(`场 ${d.scene}：接老段 要至少一个老段`);
  const legacyEvents: Record<string, EventDef<Ext>> = {};
  const segmentTable: { key: string; startSec: number; sec: number }[] = [];
  let prevEnd = 0;
  for (const x of d.legacySegs) {
    if (`${x.key}.起` in legacyEvents) throw new Error(`老段 ${x.key} 列了两次`);
    const startSec = x.startSec ?? prevEnd;
    if (!(startSec >= 0)) throw new Error(`${x.key} 的起秒不能是负的：${startSec}`);
    if (!(x.sec > 0)) throw new Error(`${x.key} 的段长要是正数：${x.sec}`);
    legacyEvents[`${x.key}.起`] = { 在: { sec: startSec }, basis: '老段（定义段），按清单顺序首尾相接' };
    legacyEvents[`${x.key}.止`] = { 在: { sec: startSec + x.sec }, basis: '老段（定义段），按清单顺序首尾相接' };
    segmentTable.push({ key: x.key, startSec: startSec, sec: x.sec });
    prevEnd = startSec + x.sec;
  }
  for (const k of Object.keys(d.events ?? {})) if (k in legacyEvents) throw new Error(`事件「${k}」和老段的事件重名`);
  const timeline = defineSceneTimeline({
    scene: d.scene,
    ...(d.aspect ? { aspect: d.aspect } : {}),
    events: { ...legacyEvents, ...(d.events ?? {}) } as Record<LegacySegEvent<K> | E, EventDef<Ext>>,
    ...(d.resolveTime ? { resolveTime: d.resolveTime } : {}),
    ...(d.sound ? { sound: d.sound } : {}),
    ...(d.duration !== undefined ? { duration: d.duration } : {}),
  });
  return { ...timeline, legacySegs: segmentTable };
};

/** 老段表和老段的 段.ts 对不对得上（anim check 用）：段长、场、画幅。返回问题列表 */
export const checkOldSeg = (
  timeline: Pick<ContinueOldSegTimeline<string, unknown>, 'scene' | 'width' | 'height' | 'legacySegs'>,
  segAt: (segKey: string) => { scene: string; sec: number; width: number; height: number } | undefined,
): string[] =>
  timeline.legacySegs.flatMap((x) => {
    const s = segAt(x.key);
    if (!s) return [`老段 ${x.key} 不在清单里`];
    const issues: string[] = [];
    if (Math.abs(s.sec - x.sec) > 5e-4) issues.push(`老段 ${x.key} 的段长：时间线里抄的 ${x.sec} 秒，段.ts 里 ${s.sec} 秒`);
    if (s.scene !== timeline.scene) issues.push(`老段 ${x.key} 是场 ${s.scene} 的段，不在 ${timeline.scene}`);
    if (s.width !== timeline.width || s.height !== timeline.height) issues.push(`老段 ${x.key} 的画幅（${s.width}×${s.height}）和场时间线（${timeline.width}×${timeline.height}）不一样`);
    return issues;
  });
