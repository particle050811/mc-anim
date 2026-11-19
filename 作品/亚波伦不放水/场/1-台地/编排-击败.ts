import { definePerformance, type TiltSettings, type PerformanceBar } from '../../角色/动作/亚波伦演出.ts';
import { actStart, v6Start, landSec, positionAtElapsed, performanceClock, shotStart, yaBoLunBeats } from './击败拍.ts';
import { absorbLanding } from './击败着地.ts';
import { steveEye, steveFoot } from './齐放拍.ts';
import { steveStateAt } from './编排-齐放.ts';

export { steveFoot, steveEye };
/** 游戏界面开关：第二镜的死亡界面。都是游戏自带的界面，用户没看过；不要就改成 false */
export const inGameUi = true;

// ── 史蒂夫：第 4 幕最后一刻（= 本幕第 0 秒）被卫射照满打死，倒下、20 刻后化烟、东西撒一地（角色/史蒂夫掉落.tsx 照原版） ──
export const afterDeathSec = (t: number) => t - actStart;
export const defeatedSteveAt = (time: number) => {
  const state = steveStateAt(time), elapsed = afterDeathSec(time);
  const start = 1 / 20, span = 0.12;
  const phase = Math.min(1, Math.max(0, (elapsed - start) / span));
  const fallClock = elapsed <= start || phase >= 1 ? elapsed : start + span * phase ** 3 * (3 - 2 * phase);
  return { ...state, struggle: 0, afterDeathSec: fallClock };
};
/**
 * 死亡消息：打死他的是卫射（prisma_beam，第 4 幕第五束照满那一刻，齐放拍.ts 的 死）。诡厄 2.5.60.6 的卫射伤害来源是 indirectMagic(她, 她)
 * （PrismaBeam 里 ModDamageSource.indirectMagic），原版 1.20.1 的 death.attack.indirectMagic，zh_cn「%1$s被%2$s使用的魔法杀死了」。
 * %2$s 是凶手的显示名：她是有称号的 boss，显示名照血条上那样「亚波伦 末日终结」（goety 的 title.goety.13；名字、称号在 界面/战斗界面.tsx，画面里拼）。
 * 七版写的「Steve被烧死了」是按结界焚死取的，这版他不是烧死的。手里的杖没改名，所以不是 .item 那一条（多一句「使用的 [杖名]」）。Agent 查的，用户没看过
 */
export const deathMsgTemplate = '%1$s被%2$s使用的魔法杀死了';

const landingShot = v6Start + shotStart.landing;
const dive = v6Start + yaBoLunBeats.descendStart;
const land = dive + yaBoLunBeats.descendSec;
const stop = land + yaBoLunBeats.glideSec;
const timeline: readonly PerformanceBar[] = [
  { start: 0, pose: '指向' },
  { start: v6Start + 0.05, dest: v6Start + 0.5, pose: '悬停' },
  { start: landingShot, dest: landingShot + yaBoLunBeats.retractPoseSec, pose: '收盘', ease: '线性' },
  { start: dive - 0.1, dest: dive + 0.05, pose: '飞行' },
  { start: land - 0.15, dest: land + 0.08, pose: '落地' },
  { start: land + 0.09, dest: land + 0.41, pose: '站立' },
  { start: stop - 0.16, dest: stop + 0.15, pose: '低头' },
];
const lean: TiltSettings = { perSpeed: 1.0, perAccel: 0.03, limit: 25, 窗: 0.08 };
const performBase = definePerformance({ timeline, 位: (sec) => positionAtElapsed(sec - v6Start), target: () => steveEye, lean });
export const performAt = (worldSec: number) => absorbLanding(performBase.在(performanceClock(worldSec)), worldSec - landSec, positionAtElapsed(worldSec - actStart)[2]);
