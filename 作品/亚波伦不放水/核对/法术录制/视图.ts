// 核对-法术录制 的视图表（纯，段.ts 也读）：录过的法术每个一槽 120 帧，同 核对-法术演出 的槽法和机位（全景 60 帧 + 近景 60 帧，各把长秒走一遍）。
// 近景和 核对-法术演出 不同：这两个法术以施法者为中心，近景对着起点（施法者）拍，不对着史蒂夫。
// 一帧三格并排，同一机位、同一时刻：左 手写演出，中 录制回放（照录下的轨迹），右 录制回放（位置由录下的出生字段按 particlePath 重算）。
// 法术第 t 秒的全景帧 = i × 120 + round(t ÷ 长秒 × 60)，近景再 + 60。
import { spellDuration, type SpellMeta } from '../../法术/演出/接口.ts';
import { spellMetas } from '../../法术/演出/元表.ts';
import type { Vec3 } from '../../法术/演出/接口.ts';

// 场地、种子、槽长、全景机位照抄 核对-法术演出/视图.ts（核对段之间不许互引），那边改了这里跟着改
export const castFrom: Vec3 = [-10, 0, 7];
export const target: Vec3 = [0, 0, 0];
export const seed = 1;
export const slotSec = 2;
const halfSlotSec = slotSec / 2;
export type CameraRig = { 名: '全景' | '近景'; 眼: Vec3; 看: Vec3; fov: number };
const wideRig: CameraRig = { 名: '全景', 眼: [-5, -24, 5], 看: [-5, 0, 3.4], fov: 40 };
/** 一格的尺寸（同 核对-法术演出 的 16:9），三格并排 */
export const panelSize = { 宽: 960, 高: 540 } as const;
export const aspect = { 宽: panelSize.宽 * 3, 高: panelSize.高 } as const;

/** 录过的法术；近距 = 近景离起点几格；起点高 = 手写演出把 起点 当成 施法者脚底 + 几格（自身为中心的两个都是 0.5），回放的脚底 = 起点 − 起点高 */
export const recordedSpells = [
  { id: 'weakening', startHeight: 0.5, closeDist: 13 },
  { id: 'frost_nova', startHeight: 0.5, closeDist: 7 },
] as const;

export interface View {
  meta: SpellMeta;
  slotIndex: number;
  startHeight: number;
  cameraRig: CameraRig;
  秒: number;
  长秒: number;
}

const entries = recordedSpells.map((x) => {
  const meta = spellMetas.find((m) => m.id === x.id);
  if (!meta) throw new Error(`核对-法术录制：手写演出里没有 ${x.id}`);
  return meta;
});

const closeRig = (distance: number): CameraRig => ({ 名: '近景', 眼: [castFrom[0], castFrom[1] - distance, castFrom[2] + distance * 0.15], 看: [castFrom[0], castFrom[1], castFrom[2] - 0.6], fov: 40 });

export const slotCount = recordedSpells.length;

export const viewAt = (segSec: number): View => {
  const slotIndex = Math.min(slotCount - 1, Math.max(0, Math.floor(segSec / slotSec + 1e-9)));
  const meta = entries[slotIndex]!;
  const inSlotSec = Math.max(0, segSec - slotIndex * slotSec);
  const isSecondHalf = inSlotSec + 1e-9 >= halfSlotSec ? 1 : 0;
  const { 长秒: durSec } = spellDuration(meta, castFrom, target);
  return { meta, slotIndex, startHeight: recordedSpells[slotIndex]!.startHeight, cameraRig: isSecondHalf ? closeRig(recordedSpells[slotIndex]!.closeDist) : wideRig, 秒: Math.min(1, Math.max(0, (inSlotSec - isSecondHalf * halfSlotSec) / halfSlotSec)) * durSec, 长秒: durSec };
};
