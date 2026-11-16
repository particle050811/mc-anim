// 电弧折线的形状（纯数学）：照 Goety 的 LightningParticleOptions.generate / createQuads（出自 Mekanism 的 BoltEffect）。
// 震撼、雷霆、释放、索命、闪电类都走它，只是参数不同（ClientProxy.shock / thunderBolt / lightningBolt）：
//   shock：       粗 0.04，散开 正弦（两头收、中间散）
//   thunderBolt： 粗 0.25，散开 线性升（越往终点越散）
//   lightningBolt：粗 0.5，散开 线性升，平行噪声 1、散开系数 0.001
// 段数默认 (int)sqrt(距离 × 100)，一条（count 1），寿命由发包的地方给（雷霆 10 刻），淡入淡出各占寿命的一半（FadeFunction.fade(0.5)）。
// 游戏用 java.util.Random 不带种子，每次形状都不同；这里换成带种子的随机数，形状固定。
import { sceneToGame, gameToScene } from '@engine/core/坐标.ts';
import { gaussian, mulberry32 } from '@engine/core/数学.ts';
import type { Vec3 } from '../接口.ts';

export type SpreadMode = '正弦' | '线性升' | '线性升降';
export interface ArcSettings {
  /** 一段的粗细（格），越靠终点越细：粗 × (0.5 + (1 − 进度) × 0.5) */
  readonly coarse: number;
  readonly spreadMode: SpreadMode;
  readonly 段数?: number;
  readonly arcCount?: number;
  /** parallelNoise：每段沿主方向走多远的随机量，默认 0.1 */
  readonly parallelNoise?: number;
  /** spreadFactor：横向最多偏出 距离 × 它 × 散开函数，默认 0.1 */
  readonly spreadFactor?: number;
  /** branchInitiationFactor、branchContinuationFactor：分叉，默认都是 0（Goety 的三种都没开） */
  readonly forkStart?: number;
  readonly forkContinue?: number;
}
export const arcPresets = {
  shock: { coarse: 0.04, spreadMode: '正弦' },
  thunderBolt: { coarse: 0.25, spreadMode: '线性升' },
  lightningBolt: { coarse: 0.5, spreadMode: '线性升', parallelNoise: 1, spreadFactor: 0.001 },
} as const satisfies Record<string, ArcSettings>;

type GameVec3 = [number, number, number];
const addVec = (a: GameVec3, b: GameVec3): GameVec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: GameVec3, b: GameVec3): GameVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scaleVec = (a: GameVec3, k: number): GameVec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: GameVec3, b: GameVec3): GameVec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vecLength = (a: GameVec3) => Math.hypot(a[0], a[1], a[2]);
// Vec3.normalize：长度 < 1e-4 返回零向量
const normalize = (a: GameVec3): GameVec3 => {
  const l = vecLength(a);
  return l < 1e-4 ? [0, 0, 0] : scaleVec(a, 1 / l);
};
// 游戏坐标（y 朝上、z 朝南）↔ 场景坐标（z 朝上、y 朝北）：截面朝哪边是按游戏坐标叉出来的，在游戏坐标里算完再换回来
const toScene = (p: GameVec3): Vec3 => gameToScene(p);

const rng = (seed: number) => {
  const rng = mulberry32(seed);
  return { rng, gaussian: () => gaussian(rng) };
};

const spreadValue = (f: SpreadMode, progress: number) =>
  f === '正弦' ? Math.sin(Math.PI * progress) : f === '线性升' ? progress : (progress - Math.max(0, 2 * progress - 1)) / 0.5;

/** 一段 = 4 个四边形（两个面各画正反）共 16 个顶点，场景坐标；按生成顺序排，淡入淡出按这个顺序截 */
export type ArcSeg = readonly Vec3[];

export const defaultSegCount = (startPos: Vec3, end: Vec3) => Math.floor(Math.sqrt(Math.hypot(end[0] - startPos[0], end[1] - startPos[1], end[2] - startPos[2]) * 100));

export const generateArc = (from: Vec3, endPoint: Vec3, settings: ArcSettings, seed: number): ArcSeg[] => {
  const rand = rng(seed);
  const startPos = sceneToGame(from);
  const end = sceneToGame(endPoint);
  const startToEndDiff = sub(end, startPos);
  const totalLength = vecLength(startToEndDiff);
  const segCount = settings.段数 ?? defaultSegCount(from, endPoint);
  const parallelNoise = settings.parallelNoise ?? 0.1;
  const spreadFactor = settings.spreadFactor ?? 0.1;
  const arcSegments: ArcSeg[] = [];
  if (segCount < 1 || totalLength === 0) return arcSegments;
  type ArcCache = { end: GameVec3; endRight: GameVec3; endBack: GameVec3 };
  type Directive = { start: GameVec3; progress: number; cache: ArcCache | null; isBranch: boolean };
  for (let arcIndex = 0; arcIndex < (settings.arcCount ?? 1); arcIndex++) {
    const queue: Directive[] = [{ start: startPos, progress: 0, cache: null, isBranch: false }];
    while (queue.length > 0) {
      const head = queue.shift()!;
      const progress = head.progress + (1 / segCount) * (1 - parallelNoise + rand.rng() * parallelNoise * 2);
      const spread = spreadValue(settings.spreadMode, progress);
      let segEnd: GameVec3;
      if (progress >= 1 && spread <= 0) {
        segEnd = end;
      } else {
        const maxOffset = spreadFactor * spread * totalLength;
        const randomDir = normalize(cross(startToEndDiff, [-0.5 + rand.rng(), -0.5 + rand.rng(), -0.5 + rand.rng()]));
        // SegmentSpreader.NO_MEMORY：每段的横偏各算各的，不累加
        segEnd = addVec(addVec(startPos, scaleVec(startToEndDiff, progress)), scaleVec(randomDir, maxOffset * rand.gaussian()));
      }
      const thick = settings.coarse * (0.5 + (1 - progress) * 0.5);
      // createQuads
      const segDelta = sub(segEnd, head.start);
      const right = scaleVec(normalize(cross(segDelta, [0.5, 0.5, 0.5])), thick);
      const normalOffset = scaleVec(normalize(cross(segDelta, right)), thick);
      const halfRight = scaleVec(right, 0.5);
      const startPoint = head.cache ? head.cache.end : head.start;
      const startRight = head.cache ? head.cache.endRight : addVec(startPoint, right);
      const startBack = head.cache ? head.cache.endBack : addVec(addVec(startPoint, halfRight), normalOffset);
      const endRight = addVec(segEnd, right);
      const endBack = addVec(addVec(segEnd, halfRight), normalOffset);
      arcSegments.push([startPoint, segEnd, endRight, startRight, startRight, endRight, segEnd, startPoint, startRight, endRight, endBack, startBack, startBack, endBack, endRight, startRight].map(toScene));
      if (progress >= 1) break;
      const cache: ArcCache = { end: segEnd, endRight: endRight, endBack: endBack };
      if (!head.isBranch) queue.push({ start: segEnd, progress: progress, cache, isBranch: false });
      else if (rand.rng() < (settings.forkContinue ?? 0)) queue.push({ start: segEnd, progress: progress, cache, isBranch: true });
      while (rand.rng() < (settings.forkStart ?? 0) * (1 - progress)) queue.push({ start: segEnd, progress: progress, cache, isBranch: true });
    }
  }
  return arcSegments;
};

/** FadeFunction.fade(淡)：活了寿命的几分之几时，画第 [始, 止) 段。前 淡 的时间从起点一段段长出来，最后 淡 的时间从起点一段段消失 */
export const visibleSegRange = (totalSegs: number, lifeRatio: number, fadeRatio = 0.5): readonly [number, number] => [
  lifeRatio > 1 - fadeRatio ? Math.trunc((totalSegs * (lifeRatio - (1 - fadeRatio))) / fadeRatio) : 0,
  lifeRatio < fadeRatio ? Math.trunc(totalSegs * (lifeRatio / fadeRatio)) : totalSegs,
];
