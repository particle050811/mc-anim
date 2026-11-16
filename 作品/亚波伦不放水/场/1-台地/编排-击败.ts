// 第 5 幕 击败的编排：死亡界面盖着，后面是七版 5-03——她收盘、一下俯冲落到那堆东西跟前、滑停低头看；他一死东西撒一地。时钟接第 4 幕（现身后几秒）。
// 用户 11-11：环绕她那一镜「做得挺好 不改」，东西「就在死亡界面撒一地」，死亡信息「改得更合适点」。她的姿势、盘照七版的钟取（击败拍.ts），和七版一样；
// 东西撒落、死亡界面、聊天栏的死亡消息是这版加进来的，Agent 摆的，用户没看过。
import { definePerformance, type TiltSettings, type PerformanceBar } from '../../角色/动作/亚波伦演出.ts';
import { openDoneTick, defaultOpenClose } from '../../界面/分圈.ts';
import type { MultiRingParams } from '../../界面/多圈轮盘.tsx';
import { arrangeWheel } from '../../界面/轮盘法术.ts';
import { v7Pos, rev7Clock, yaBoLunBeats, actStart, retractStart, secAt, landSec, standStillSec } from './击败拍.ts';
import { steveEye, steveFoot } from './编排-齐放.ts';

export { actStart, actDur, secAt, yaBoLunPos, landSec, dropSeed, cursorMove, cursorAt } from './击败拍.ts';

/** 游戏界面开关：死亡界面、聊天栏里的死亡消息。都是游戏自带的界面，用户没看过；不要就改成 false */
export const inGameUi = true;

// ── 史蒂夫：第 4 幕最后一刻（= 本幕第 0 秒）被卫射照满打死，倒下、20 刻后化烟、东西撒一地（角色/史蒂夫掉落.tsx 照原版） ──
export const afterDeathSec = (t: number) => t - actStart;
export { steveFoot, steveEye };
/**
 * 死亡消息：打死他的是卫射（prisma_beam，第 4 幕第二束照满那一刻，齐放拍.ts 的 死）。诡厄 2.5.60.6 的卫射伤害来源是 indirectMagic(她, 她)
 * （PrismaBeam 里 ModDamageSource.indirectMagic），原版 1.20.1 的 death.attack.indirectMagic，zh_cn「%1$s被%2$s使用的魔法杀死了」。
 * %2$s 是凶手的显示名：她是有称号的 boss，显示名照血条上那样「亚波伦 末日终结」（goety 的 title.goety.13；名字、称号在 界面/战斗界面.tsx，画面里拼）。
 * 七版写的「Steve被烧死了」是按结界焚死取的，这版他不是烧死的。手里的杖没改名，所以不是 .item 那一条（多一句「使用的 [杖名]」）。Agent 查的，用户没看过
 */
export const deathMsgTemplate = '%1$s被%2$s使用的魔法杀死了';

// ── 她：七版的编排（七版的钟）：一直悬停着，5-03 开头收盘一招（7 帧摆好、盘照原版快慢收回），收完一下俯冲落地滑一小段站住、低头看 ──
const clockAt = (t: number) => rev7Clock(t);
const timeline: readonly PerformanceBar[] = [
  { start: 0, pose: '悬停' },
  // 收盘：7 帧把杖竖到身前（线性，出手段），盘收完再把杖放到身侧
  { start: clockAt(actStart), dest: clockAt(actStart) + yaBoLunBeats.retractPoseSec, pose: '收盘', ease: '线性' },
  { start: clockAt(secAt(yaBoLunBeats.descendStart)), dest: clockAt(secAt(yaBoLunBeats.descendStart)) + 0.2, pose: '悬停' },
  { start: clockAt(landSec) - 0.1, dest: clockAt(landSec) + 0.08, pose: '落地' },
  { start: clockAt(landSec) + 0.09, dest: clockAt(landSec) + 0.24, pose: '站立' },
  // 滑慢下来时低头看地上那堆东西
  { start: clockAt(standStillSec) - 0.3, dest: clockAt(standStillSec) + 0.15, pose: '低头' },
];
/** 俯冲时身子往冲的方向倒、急刹往后仰（同第 4 幕） */
const lean: TiltSettings = { perSpeed: 1.0, perAccel: 0.03, limit: 25, 窗: 0.08 };
const performBase = definePerformance({ timeline, 位: v7Pos, target: () => steveEye, lean });
/** 她的演出（编排的钟）：换到七版的钟取，浮动、待机动画的相位和七版一样 */
export const perform = { ...performBase, 在: (t: number) => performBase.在(clockAt(t)), 杖: (t: number) => performBase.杖(clockAt(t)) };
const ringCount = arrangeWheel({ 放: '有画面' }).cellsPerRing.length;
/** 七版 5-03 开头盘转到第 328 刻（盘的转角照它，和七版一样） */
const v7StartTick = 328;
/** 轮盘：开着、不亮格（没在放法术）；从最外圈往里一圈圈收回杖尖（照原版开合的快慢倒着走：每圈 2.5 刻、相邻两圈隔 2.5 刻），
 *  最里一圈缩没时圆心的炼狱聚晶一起灭 */
export const wheelParams = (t: number): MultiRingParams | null => {
  const tick = v7StartTick + (t - actStart) * 20;
  if (t < retractStart) return { 放: '有画面', 刻: tick, openClose: defaultOpenClose, selectedId: [] };
  const closeTick = (t - retractStart) * 20;
  return closeTick >= openDoneTick(ringCount, defaultOpenClose) ? null : { 放: '有画面', 刻: tick, openClose: defaultOpenClose, selectedId: [], closeTick };
};
/** 盘收完的时刻（编排的钟） */
export const closeDoneSec = retractStart + openDoneTick(ringCount, defaultOpenClose) / 20;
if (closeDoneSec > secAt(yaBoLunBeats.descendStart) + 1e-6) throw new Error(`击败：盘 ${closeDoneSec - actStart} 秒才收完，俯冲在 ${yaBoLunBeats.descendStart} 秒（击败拍.ts 的 她拍）`);
