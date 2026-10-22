// 李樱从扫帚上跳下来的姿势：蹲下蓄力 → 蹬出去 → 空中抡锤蓄力 → 收成头朝下下锤击的架势。
// 画面上不再演（用户 10-19：6-3-3 从思索推近接上，已经头朝下俯冲，见 6-3-下坠/时间线.ts 的 `刻`.俯冲起），留着是因为髋高、起跳点和下坠轨迹从这里算。
// 缘由（用户 10-13 看段内约第 86 帧：「像自由落体，下落攻击动作太僵硬」）：原来（6-3-下坠/编排.ts 的 `KEYS`）蹲下时锤已举过头顶，一蹬后双臂伸直举锤像一根棍子翻过去，各部位同起同停、不冲过头。
// 这里在原姿势上换掉物理时间 `刻`.抡出 以后的一段，思路同 6-1-2/动作改进.ts：
//   ① 收身蓄力：锤收在胸前、身子压低、膝再弯、低头盯城；② 蹬出：腿猛蹬直，双臂把锤从胸前抡过头顶甩到脑后，冲过一点再回（'back'）；
//   ③ 空中蓄力：身子后仰、锤垂在背后（同 6-3-5 往后抡），右腿屈膝在前、左腿在后；
//   ④ 翻成头朝下（`刻`.翻完）出手：先收腰，上臂、前臂、头依次跟上（`sampleLag` 错开），双臂甩到头顶前方冲过一点再收住，腿并拢，段末停在原来的下锤击架势上。
// 约束：
// - `recover` 以后完全是原姿势：最后一个关键姿势取 `旧终`，错开的延迟收完以后才开抡（时间线.ts 的 `刻`.开抡），撞击时刻用的 `strikeDepth`（编排.ts `strikePose`）不变。
// - 跃出那刻（`刻`.跃出）腿、膝、前倾和原来一模一样（取 `oldPoseAt`(`刻`.跃出)）：这些量定髋高，髋高定起跳点、下坠轨迹和撞击时刻，一动整条时间线重算。所以腿和前倾不错开（延迟 0）；ground、squash 不动。
// - 两只手握同一把锤（挂在右手上），左右臂不错开，否则左手离开锤柄；错开只在 上臂 → 前臂 → 头 之间。
// - 不加特效：金光原来就有（随锤头轨迹）。
import { sampleLag, type Interp, type Key } from '@engine/anim/anim.ts';
import type { FigurePose } from '@库/角色/骨架.tsx';
import { 刻 } from '../6-3-下坠/时间线.ts';

type PoseField = 'pitch' | 'headPitch' | 'legR' | 'legL' | 'kneeR' | 'kneeL' | 'legRRoll' | 'legLRoll' | 'armR' | 'armL' | 'armRRoll' | 'armLRoll' | 'elbowR' | 'elbowL';
// 关键值：数 = 绝对值；'起' = 原姿势在 刻.抡出（接得上前面）；'跃' = 原姿势在 刻.跃出（髋高不变）；'终' = 原来的末姿势（接得上 6-3-4）
type KeyValue = number | '起' | '跃' | '终';
type Track = { delay: number; 键: [w: number, v: KeyValue, interp?: Interp][] };

const startSec = 刻.swingOut; // 1.2：锤刚抡到身前、双手握住
const crouch = 1.42; // 收身蹲到底
const settle = 1.5; // 蹲住（攒劲）到这里
const leap = 刻.leap; // 1.55：脚离开杆
const straighten = 1.61; // 腿蹬直（只停一下就收腿）
const behind = 1.72; // 锤甩到脑后
const spread = 1.76; // 空中拉开
const release = 刻.flipDone; // 1.97：翻成头朝下，出手
const recover = 2.24; // 回到下锤击架势（+ 最大延迟 0.035 = 2.275 秒，之后开抡）

// 双臂：胸前 → 抡过头顶 → 脑后（冲过一点）→ 慢慢再往后拉 → 出手甩到头顶前方（冲过一点）停在 168
const armKeys: Track['键'] = [[startSec, '起'], [crouch, 100], [settle, 97], [leap, 122], [1.62, 196, 'back'], [behind, 226], [spread, 230], [release, 236, 'back'], [recover, '终']];
const elbowKeys: Track['键'] = [[startSec, '起'], [crouch, 58], [settle, 60], [leap, 42], [1.62, 20, 'back'], [behind, 48], [spread, 52], [release, 58, 'back'], [recover, '终']];
const armRollKeys: Track['键'] = [[startSec, '起'], [settle, 26], [behind, 14], [release, 12], [recover, '终']];
const tracks: Record<PoseField, Track> = {
  // 腰先动：蹲时往前压，蹬直，空中后仰拉开，出手时先收回来
  pitch: { delay: 0, 键: [[startSec, '起'], [crouch, -34], [settle, -34], [leap, '跃'], [straighten, -6], [spread, 16], [release, 20, 'back'], [recover, '终']] },
  // 蹲时低头盯着城，空中抬头（头朝下的人抬头 = 看地面）
  headPitch: { delay: 0.02, 键: [[startSec, '起'], [crouch, -38], [settle, -38], [leap, -28], [straighten, -6], [spread, 22], [release, 26], [recover, '终']] },
  // 腿：再蹲深一点，跃出那一刻接回原值，蹬直以后右腿屈膝在前、左腿在后，两腿略张开
  legR: { delay: 0, 键: [[startSec, '起'], [crouch, 84], [settle, 84], [leap, '跃'], [straighten, 6], [spread, 42], [release, 48], [recover, '终']] },
  kneeR: { delay: 0, 键: [[startSec, '起'], [crouch, 128], [settle, 128], [leap, '跃'], [straighten, 4], [spread, 86], [release, 94], [recover, '终']] },
  legL: { delay: 0, 键: [[startSec, '起'], [crouch, 84], [settle, 84], [leap, '跃'], [straighten, 4], [spread, -14], [release, -18], [recover, '终']] },
  kneeL: { delay: 0, 键: [[startSec, '起'], [crouch, 128], [settle, 128], [leap, '跃'], [straighten, 4], [spread, 38], [release, 44], [recover, '终']] },
  legRRoll: { delay: 0, 键: [[startSec, '起'], [leap, '跃'], [spread, -10], [release, -12], [recover, '终']] },
  legLRoll: { delay: 0, 键: [[startSec, '起'], [leap, '跃'], [spread, -14], [release, -16], [recover, '终']] },
  armR: { delay: 0.012, 键: armKeys },
  armL: { delay: 0.012, 键: armKeys },
  armRRoll: { delay: 0.012, 键: armRollKeys },
  armLRoll: { delay: 0.012, 键: armRollKeys },
  elbowR: { delay: 0.035, 键: elbowKeys },
  elbowL: { delay: 0.035, 键: elbowKeys },
};
const fields = Object.keys(tracks) as PoseField[];

let table: Record<PoseField, { delay: number; 键: Key[] }> | null = null;
const fieldValue = (p: FigurePose, f: PoseField) => ((p as unknown as Record<string, number | undefined>)[f] ?? 0);

// 旧：原来在 w 的姿势；旧在：原来任意时刻的姿势（6-3-下坠/编排.ts 的 blend(KEYS, …)）
export const releasePose = (physSec: number, oldPose: FigurePose, oldPoseAt: (physSec: number) => FigurePose): FigurePose => {
  if (physSec <= startSec) return oldPose;
  if (!table) {
    const refPoses = { 起: oldPoseAt(startSec), 跃: oldPoseAt(leap), 终: oldPoseAt(99) };
    const built: Record<string, { delay: number; 键: Key[] }> = {};
    for (const field of fields) {
      const t = tracks[field];
      built[field] = { delay: t.delay, 键: t.键.map(([k, keyValue, i]) => [k, typeof keyValue === 'number' ? keyValue : fieldValue(refPoses[keyValue], field), i] as Key) };
    }
    table = built as NonNullable<typeof table>;
  }
  const out: FigurePose = { ...oldPose, loc: [...oldPose.loc] };
  for (const field of fields) (out as unknown as Record<string, number>)[field] = sampleLag(table![field].键, physSec, table![field].delay);
  return out;
};
