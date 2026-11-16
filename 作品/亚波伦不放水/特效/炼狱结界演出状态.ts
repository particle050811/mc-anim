// 炼狱结界在本片里的演法（纯数据）：扔出 → 罩住 → 收缩焚烧。用户 11-09 定：亚波伦张开轮盘后第一手「扔出」结界，飞行中涨大、罩住史蒂夫把他钉住；
// 之后齐放往线框里灌；最后结界收缩、内部焚烧完成击杀（需求.md）。原版不是这样：结界长在施法者身上跟着走，没有飞行、涨大、收缩，也不放火（线框本身照原版，见 @库/特效/炼狱结界.tsx）。
// 下面的默认时长是照第二稿分镜取的，没经用户看过。正片在 场/1-台地/编排-齐放.ts 的 结界设定 里覆盖：第 4 幕和第一轮一起扔，0.75 秒罩严，
// 罩到他死就没了，不收缩焚烧（用户 11-11「而不是法术烧完后死掉」）。
import { easeOutQuad, lerp, smoothstep01 } from '@engine/core/数学.ts';
import { revelationCageVanilla, revelationCageOpacity, cageSphereRadius } from '@库/特效/炼狱结界线.ts';

type V3 = [number, number, number];

export type CagePerformanceSetting = {
  /** 结界中心的起点（场景坐标，施法者身前）、终点（史蒂夫半身高处；原版结界中心也在半身高） */
  from: V3;
  target: V3;
  /** 飞出：默认 1.5 秒 = 原版淡入的 30 刻，落到位时正好淡入完 */
  flyOutSec: number;
  /** 罩住：默认 67.5 秒（第二稿分镜从罩严到收缩的长度；正片按他几时死算） */
  coverSec: number;
  /** 收缩焚烧：默认 2.5 秒（第二稿分镜收缩焚烧那一镜；正片是 0）；前 收缩占比 这一截在缩，缩完停在最小烧到完 */
  shrinkBurnSec: number;
  shrinkShare: number;
  /** 半径系数（原版结界 5.8905764，顶点离中心 = 系数 × 1.6472 格） */
  startRadiusFactor: number;
  fullRadiusFactor: number;
  /** 第二稿分镜「缩到一人大小」：默认 0.75，顶点离中心约 1.24 格 */
  shrinkToRadiusFactor: number;
  /** 转动的钟比演出的钟早几秒（原版的相位取决于游戏开了多久，随便取） */
  spinPhaseSec: number;
};

export const cagePerformanceDefaults: Omit<CagePerformanceSetting, 'from' | 'target'> = {
  flyOutSec: 1.5,
  coverSec: 67.5,
  shrinkBurnSec: 2.5,
  shrinkShare: 0.6,
  startRadiusFactor: revelationCageVanilla.radiusFactor * 0.03,
  fullRadiusFactor: revelationCageVanilla.radiusFactor,
  shrinkToRadiusFactor: 0.75,
  spinPhaseSec: 0,
};

export type CagePhase = '未出' | '飞出' | '罩住' | '收缩焚烧' | '结束';
export type CagePerformanceState = {
  stage: CagePhase;
  /** 本阶段走了几成 */
  progress: number;
  center: V3;
  radiusFactor: number;
  /** 顶点离中心几格 */
  circumRadius: number;
  opacity: number;
  /** 给线框转动用的秒 */
  spinSec: number;
  /** 史蒂夫是不是被钉住（罩住起）。原版是结界所在方块外扩 8.5 格内的活物每刻被拉回上一刻的位置、速度清零 */
  pinned: boolean;
  /** 0～1，收缩焚烧里从 0 涨到 1 */
  fireIntensity: number;
};

/** 秒：从扔出那一刻算。飞出时中心和半径用同一个缓出进度：离手快、到位慢；半径和中心离起点的距离一起线性涨，所以只要起点离目标比满结界的外接球远，结界往起点后面伸出去的不超过起始半径，不会把施法者吞进去 */
export const cagePerformanceStateAt = (sec: number, settings: CagePerformanceSetting): CagePerformanceState => {
  const coverStartSec = settings.flyOutSec;
  const shrinkStartSec = coverStartSec + settings.coverSec;
  const end = shrinkStartSec + settings.shrinkBurnSec;
  const makeState = (stage: CagePhase, progress: number, center: V3, radiusFactor: number, fireIntensity = 0): CagePerformanceState => ({
    stage: stage,
    progress: progress,
    center: center,
    radiusFactor,
    circumRadius: radiusFactor * cageSphereRadius,
    // 淡入照原版：出手起 30 刻
    opacity: stage === '未出' || stage === '结束' ? 0 : revelationCageOpacity(sec * 20),
    spinSec: sec + settings.spinPhaseSec,
    pinned: stage === '罩住' || stage === '收缩焚烧',
    fireIntensity,
  });
  if (sec < 0) return makeState('未出', 0, settings.from, settings.startRadiusFactor);
  if (sec < coverStartSec) {
    const x = sec / settings.flyOutSec;
    const u = easeOutQuad(x);
    const center: V3 = [lerp(settings.from[0], settings.target[0], u), lerp(settings.from[1], settings.target[1], u), lerp(settings.from[2], settings.target[2], u)];
    return makeState('飞出', x, center, lerp(settings.startRadiusFactor, settings.fullRadiusFactor, u));
  }
  if (sec < shrinkStartSec) return makeState('罩住', (sec - coverStartSec) / settings.coverSec, settings.target, settings.fullRadiusFactor);
  if (sec < end) {
    const x = (sec - shrinkStartSec) / settings.shrinkBurnSec;
    const collapse = smoothstep01(Math.min(1, x / settings.shrinkShare));
    return makeState('收缩焚烧', x, settings.target, lerp(settings.fullRadiusFactor, settings.shrinkToRadiusFactor, collapse), x);
  }
  // 烧完直接没有，不走原版的 30 刻淡出（第二稿烧完硬切第 5 幕、开头「结界没了」；正片他一死就没了）
  return makeState('结束', 1, settings.target, settings.shrinkToRadiusFactor, 0);
};

/** 各阶段从第几秒起（演出的钟） */
export const cagePerformanceTimes = (settings: CagePerformanceSetting) => ({
  engulf: settings.flyOutSec,
  shrinkBurnSec: settings.flyOutSec + settings.coverSec,
  结束: settings.flyOutSec + settings.coverSec + settings.shrinkBurnSec,
});
