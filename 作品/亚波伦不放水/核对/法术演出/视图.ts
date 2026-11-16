// 核对-法术演出 的视图表（纯，段.ts 也读）：照 元表 自动生成，不用手改。坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格）。
// 每个法术一槽 120 帧（2 秒），槽的顺序 = 元表.ts 的顺序（样板、甲、乙、丙、丁，组内照各组表）：
//   槽内第 0～59 帧 全景（起点和史蒂夫都在画里），第 60～119 帧 近景（对着史蒂夫）；
//   两半各把这个法术从出手到结束（长秒）走一遍：法术的秒 = 半槽里的第几帧 ÷ 60 × 长秒。
// 第 i 个（从 0 数）法术的全景在第 i × 120 帧起，近景在第 i × 120 + 60 帧起；法术第 t 秒的全景帧 = i × 120 + round(t ÷ 长秒 × 60)。
import { spellDuration, type SpellMeta, type Vec3 } from '../../法术/演出/接口.ts';
import { spellMetas } from '../../法术/演出/元表.ts';

export const aspect = { width: 1280, height: 720 } as const;
export const slotSec = 2;
export const halfSlotSec = slotSec / 2;

/** 法术从这出来（左上空中）；目标：史蒂夫脚底 */
export const castFrom: Vec3 = [-10, 0, 7];
export const target: Vec3 = [0, 0, 0];
export const seed = 1;

export type CameraRig = { name: '全景' | '近景'; 眼: Vec3; 看: Vec3; fov: number };
// 机位在南边朝北看：西（起点）在画面左边
export const cameraRigs: readonly [CameraRig, CameraRig] = [
  { name: '全景', 眼: [-5, -24, 5], 看: [-5, 0, 3.4], fov: 40 },
  { name: '近景', 眼: [1.2, -9, 2.4], 看: [0, 0, 1.1], fov: 40 },
];

export interface View {
  meta: SpellMeta;
  slotIndex: number;
  cameraRig: CameraRig;
  /** 法术出手后的秒 */
  sec: number;
  长秒: number;
  hitSec?: number;
}

/** 段里第几秒 → 看哪个法术、哪个机位、法术的第几秒 */
export const viewAt = (segSec: number): View => {
  const slotIndex = Math.min(spellMetas.length - 1, Math.max(0, Math.floor(segSec / slotSec + 1e-9)));
  const meta = spellMetas[slotIndex]!;
  const inSlotSec = Math.max(0, segSec - slotIndex * slotSec);
  const isSecondHalf = inSlotSec + 1e-9 >= halfSlotSec ? 1 : 0;
  const spellTiming = spellDuration(meta, castFrom, target);
  return { meta, slotIndex, cameraRig: cameraRigs[isSecondHalf], sec: Math.min(1, Math.max(0, (inSlotSec - isSecondHalf * halfSlotSec) / halfSlotSec)) * spellTiming.长秒, ...spellTiming };
};
