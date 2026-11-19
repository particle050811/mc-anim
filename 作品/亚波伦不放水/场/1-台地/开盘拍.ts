// 第 2 幕的拍子（幕内世界秒）和慢放：时间线.ts 照这里排事件，开盘时刻.ts、编排-开盘.ts 照这里排动作，段 2-开盘 照这里卡声音、切镜头。
// 纯计算、不引时间线（时间线引它）。时刻、慢放的快慢都是 Agent 取的，用户没看过。
// 11-11 重排（用户「11-15 怎么砍这么多刀？ 亚波伦被偷袭第一次瞬移走 第二次就迅速拉升 史蒂夫砍不到 飞行的时候伸出法杖 圆环缓缓张开，环绕镜头慢放（这几个动作同时发生）」）：
// 七刀不要了，换成他拿断曜流光潜行挥剑冲两次（物品/断曜流光冲刺.ts）：第一次她瞬移走，第二次她往上一拉，他从她脚底下冲过去；
// 她往祭坛上空拉升的同时伸杖、杖尖张盘，这一段慢放、镜头绕着她转，慢放完她停在祭坛上空 12 格、盘张开、杖指着他。
// 世界秒 = 动作的钟（人怎么动、盘怎么张、粒子怎么飘都按它）；片秒 = 画面的钟（段内秒）。慢放以外两个钟一样。

/** 幕内世界秒 */
export const beats = {
  /** 她从祭坛上飞起来、飞到他东北边六格外悬停（贴地，脚离地 0.4 格） */
  takeoff: 0,
  arriveSec: 0.3,
  /** 他按下潜行（断曜流光冲刺要潜行着挥） */
  sneakFirstSec: 0.14,
  /** 第一次：挥剑冲出去 */
  dashFirstSec: 0.4,
  /**
   * 瞬移：他挥剑冲出去那一刻她才冒烟（预兆），他冲到离她不到 5 米（冲刺第 2～3 刻之间，下一刻就撞上）她挪走；挪到他冲完要回头的方向（他第二次冲的那条线上）。
   * 用户 11-19「史蒂夫没有发动冲锋的时候，亚波伦就未卜先知离开了」：原来 0.30 秒就冒烟、冲出去 0.04 秒（他还在 17 米外）就挪走
   */
  smokeStart: 0.4,
  移: 0.52,
  /** 第一冲刹住就开始回头，二冲前把近半圈转完；物品冷却仍按 15 刻。 */
  lookBack: [0.89, 1.23] as const,
  /** 她看他回头就往下一沉（预备），他挥剑前 0.06 秒（他蓄剑的时候）就往上一拉：防守的比出手早几帧动（打戏记忆），他冲到她底下时她已经离地 */
  sinkSec: 1.05,
  liftStart: 1.19,
  dashSecondSec: 1.25,
  /** 她拉到祭坛上空刹住 */
  peakSec: 1.87,
  /** 拉升转身时摆好握姿，张盘前留几帧定杖。 */
  staffExtend: [1.36, 1.48] as const,
  /** 杖尖张盘（原版快慢：三圈 7.5 刻 = 0.375 秒，慢放里看着是 1.5 秒） */
  openWheelSec: 1.5,
  /** 拉升姿态转到封面侧身；右手已经摆好。 */
  finishStanceSec: [1.73, 1.99] as const,
  aimSettleSec: 2.32,
  /** 他冲完站起来（松开潜行），抬头看她 */
  standUp: 2.06,
  /** 幕末 */
  endSec: 2.4,
};

/** 慢放：片秒 起 开始 入 秒里减到 率，世界秒到 止 以后 出 秒里回到原速（速率对片秒线性变，世界钟一阶连续，不会一顿）。
 *  起 = 他从她脚底下冲过去那一下（冲二后 0.07 秒）；止 = 她刹住、盘张完以后 */
export const slowMo = { start: beats.dashSecondSec + 0.07, 入: 0.15, slowRate: 0.25, end: 1.91, 出: 0.25 };

// 速率 r(片秒)：起 之前 1；[起, 起 + 入] 线性降到 率；保持到 持止；[持止, 持止 + 出] 线性回 1
const inEndWorld = slowMo.start + (slowMo.入 * (1 + slowMo.slowRate)) / 2;
const holdEndSec = slowMo.start + slowMo.入 + (slowMo.end - inEndWorld) / slowMo.slowRate;
const slowExitEnd = holdEndSec + slowMo.出;
const outEndWorld = slowMo.end + (slowMo.出 * (1 + slowMo.slowRate)) / 2;
/** 慢放各段的片秒：开始减速、减完、开始回速、回完 */
export const slowClipMarks = { start: slowMo.start, decelEndSec: slowMo.start + slowMo.入, returnStart: holdEndSec, returnEndSec: slowExitEnd };

/** 幕内片秒 → 幕内世界秒 */
export const toWorldSec = (s: number): number => {
  const { start: startSec, 入: easeInSec, slowRate, 出: easeOutSec } = slowMo;
  if (s <= startSec) return s;
  if (s <= startSec + easeInSec) {
    const u = s - startSec;
    return startSec + u - ((1 - slowRate) * u * u) / (2 * easeInSec);
  }
  if (s <= holdEndSec) return inEndWorld + slowRate * (s - startSec - easeInSec);
  if (s <= slowExitEnd) {
    const u = s - holdEndSec;
    return slowMo.end + slowRate * u + ((1 - slowRate) * u * u) / (2 * easeOutSec);
  }
  return outEndWorld + (s - slowExitEnd);
};
/** 幕内世界秒 → 幕内片秒（世界秒单调增，二分） */
export const toClipSec = (w: number): number => {
  if (w <= slowMo.start) return w;
  if (w >= outEndWorld) return slowExitEnd + (w - outEndWorld);
  let [a, b] = [slowMo.start, slowExitEnd];
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    if (toWorldSec(m) < w) a = m;
    else b = m;
  }
  return (a + b) / 2;
};
/** 这一刻世界钟走多快（世界秒每片秒） */
export const slowRateAt = (s: number): number => {
  const { start: startSec, 入: easeInSec, slowRate } = slowMo;
  if (s <= startSec || s >= slowExitEnd) return 1;
  if (s <= startSec + easeInSec) return 1 - ((1 - slowRate) * (s - startSec)) / easeInSec;
  if (s <= holdEndSec) return slowRate;
  return slowRate + ((1 - slowRate) * (s - holdEndSec)) / slowMo.出;
};
/** 第 2 幕多长（片秒） */
export const actDur = toClipSec(beats.endSec);
/** 慢放多出来的片秒：第 2 幕末以后，编排的钟（世界秒，现身后几秒）比片上的「现身后几秒」慢这么多。
 *  第 4、5 幕的幕起、仪式结构的钟都按片秒减去它取，和第 2 幕末一帧接上（浮动、头发、盘转角、火不跳） */
export const slowExtraSec = actDur - beats.endSec;
/** 第 2 幕末盘张开后第几刻（三圈 7.5 刻张完，再转一会儿）；第 4 幕的盘从这一刻接着转 */
export const act2EndWheelTick = (beats.endSec - beats.openWheelSec) * 20;
/** 第 2 幕末史蒂夫的 秒（第 2 幕传的是幕内世界秒）；第 4 幕他的待机、光泽、光环自转从这里接着走 */
export const act2EndSteveSec = beats.endSec;
