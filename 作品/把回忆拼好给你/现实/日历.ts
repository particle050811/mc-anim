// 桌上倒计时日历被风吹的进度（纯函数，段.ts、测试也能读）：用户 10-24「撕页 改成 风吹日历 掉的越来越快 撕日历还得做撕的动作 反而麻烦」。
// 起（第 100 拍）到止（第 104 拍）之间，从 100 一页页吹到 1：第 k 页在 起 + 时长 × ((k − 1) / 98)^(1 / 加速) 离开本子，头一页单独飞、往后越来越密，
// 最后一页（2）正好在 止 飞走、停在 1。飞走的纸往右上翻着飞出画面；飞得太密时只画其中几张（按页号散列挑，挑哪几张只看页号、不看帧率，前后不跳）。
import { hash2 } from '@engine/core/噪声.ts';

/** 日历的尺寸（贴图像素，日历本.tsx 按它搭）。宽 48：「距高考还有」一行 44 宽、「100天」大字 2 倍也 44 宽；页高 32；装订 6 高、8 深；纸叠 2～6 深（剩 1 页到满 100 页）。
 *  比原来的 64 宽、3 倍大字小一圈：课表要整张露在右屏里（用户 10-24「课程表怎么不展示完全」），桌上只剩日历一样东西。Agent 暂定 */
export const calendarSize = { 宽: 48, pageHeight: 32, bindingHeight: 6, bindingDepth: 8, paperMinThickness: 2, paperMaxThickness: 6 } as const;

/** 第一页的天数 */
export const fullPages = 100;

/** 吹日历的节奏：加速 = 离开时刻的幂（越大头几页越疏、最后越密）；飞 = 一页从离开到飞出画面几秒；每秒最多画几张新飞走的。
 *  加速 2.5：第 1 页单独飞 0.27 秒，第 2、3 页隔 0.09 秒，到最后每秒走 145 页。每秒最多画 36 张（24 fps 时每帧 1.5 张）：最后 0.4 秒空中也只十来张，不糊成一团白。Agent 暂定 */
export const blowParams = { accelExp: 2.5, flySec: 0.42, maxPerSec: 36 } as const;

export type BlowWindow = { 起: number; 止: number };

/** 第 k 页（k = 1 是 100 那页，k = 满页 − 1 是 2 那页）离开本子的秒数 */
export const leaveSec = (k: number, blowWindow: BlowWindow) => blowWindow.起 + (blowWindow.止 - blowWindow.起) * ((k - 1) / (fullPages - 2)) ** (1 / blowParams.accelExp);

/** 到 秒 为止飞走了几页（离开那一刻算飞走） */
export const flownPageCount = (sec: number, blowWindow: BlowWindow): number => {
  if (sec < blowWindow.起) return 0;
  if (sec >= blowWindow.止) return fullPages - 1;
  const u = (sec - blowWindow.起) / (blowWindow.止 - blowWindow.起);
  // 反解 离开秒：u ≥ ((k − 1) / 98)^(1/加速) ⇔ k ≤ 1 + 98 u^加速
  return Math.min(fullPages - 1, Math.floor(1 + (fullPages - 2) * u ** blowParams.accelExp + 1e-9));
};

/** 本子最上面那页印的天数 */
export const calendarPageCount = (sec: number, blowWindow: BlowWindow) => fullPages - flownPageCount(sec, blowWindow);

/** 第 k 页离开时一秒走几页（离开秒 对 k 的导数的倒数，窗长按 1 秒算），用来挑画哪几张 */
const pagesPerSec = (k: number) => {
  const u = ((k - 1) / (fullPages - 2)) ** (1 / blowParams.accelExp);
  return u <= 0 ? 0 : (fullPages - 2) * blowParams.accelExp * u ** (blowParams.accelExp - 1);
};

export type FlyingPage = { 数: number; age: number; 种: number };

/** 秒 这一刻还在空中的纸（先飞的在前）：龄 = 离开了几秒的比例（0～1），种 = 这张自己的散列（翻法、偏一点） */
export const flyingPages = (sec: number, blowWindow: BlowWindow): FlyingPage[] => {
  const out: FlyingPage[] = [];
  const n = flownPageCount(sec, blowWindow);
  for (let k = 1; k <= n; k++) {
    const age = (sec - leaveSec(k, blowWindow)) / blowParams.flySec;
    if (age >= 1) continue;
    const seed = hash2(k, 7, 4021);
    const density = pagesPerSec(k);
    if (density > blowParams.maxPerSec && seed * density >= blowParams.maxPerSec) continue;
    out.push({ 数: fullPages + 1 - k, age: Math.max(0, age), 种: seed });
  }
  return out;
};

/** 一张飞纸在 龄（0～1）时相对它原来位置（页面左下角）的位移和样子（贴图像素）：往右上加速飞、上下翻（高 = 页高 × |cos|，背面朝外时露纸背）。
 *  头一点往上掀（风从下面把页角掀起来），再往右上甩出去；翻两圈到两圈半，按 种 错开。Agent 暂定的轨迹 */
export const flyPose = (age: number, seed: number) => {
  const flipAngle = Math.PI * age * (4 + seed);
  const c = Math.cos(flipAngle);
  return {
    dx: Math.round(age * 8 + age * age * (70 + 20 * seed)),
    dz: Math.round(age * 24 + age * age * 120),
    高: Math.max(1, Math.round(calendarSize.pageHeight * Math.abs(c))),
    isBack: c < 0,
  };
};

/** 剩 顶 页时纸叠多厚（整贴图像素）。纸叠贴着装订的后边，越吹越薄，正面往里退 */
export const paperThickness = (pagesOnTop: number) => {
  const S = calendarSize;
  return Math.round(S.paperMinThickness + (S.paperMaxThickness - S.paperMinThickness) * Math.min(1, Math.max(0, pagesOnTop / fullPages)));
};

/** 一页上字怎么排（贴图像素，原点是页面左上角，页面 = 日历尺寸 宽 × 页高）：小字「距高考还有」一行（游戏像素字，汉字 8 高、步进 9），
 *  下面大数字放大 2 倍（原版位图数字 5×7、步进 6），「天」跟在数字右边、底对齐。数字和「天」作为一组水平居中 */
export const pageLayout = (dayNum: number) => {
  const width = calendarSize.宽;
  const scale = 2;
  const numberWidth = (String(dayNum).length * 6 - 1) * scale;
  const x = Math.floor((width - (numberWidth + 2 + 8)) / 2);
  const y = 14;
  return { smallTextY: 3, bigTextScale: scale, 数: { x, y, 宽: numberWidth, 高: 7 * scale }, 天: { x: x + numberWidth + 2, y: y + 7 * scale - 8, 宽: 8, 高: 8 } };
};
