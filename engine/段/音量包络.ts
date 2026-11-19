// 音量包络：随时间变的音量乘子（淡入、淡出、整体抬一截再落回来），乘到资产 cue 上。纯模块。
// 场时间线的 gainAutomation（窗口段.ts）和 放() 的 gainEnvelope（声音助手.ts）都走这里；放的时候、查段缝、出时间轴读增益都用 cueGainAt。
// 落在常数区的 cue 只把 增益 乘一个数；碰到坡道的另带一张包络表（cue 的 envelope），每秒 段格 个、格落在段的输出帧上
// （Remotion 一帧取一次增益，取这一帧开头那一刻，见 段画面.tsx），cue 起点不在帧上也照公式取到准数；表只铺坡道那一截，前后取头尾。
// 不改 增益 的逐格表、不改 段定义.ts 的 cueGain：那两样在每一段（老段、核对段）的指纹里，动了全片过期。
import { interpTable } from './按时取值.ts';
import { cueGain, segFps, isPerCell, type AssetCue, type EnvelopeTable } from './段定义.ts';

/** 两点之间怎么过渡（x 是这一截里走过的比例 0→1，增益按倍数在两点之间插）：
 *  cosine 半余弦缓动 0.5 − 0.5·cos(πx)；equalPowerIn 等功率淡入 sin(π/2·x)；equalPowerOut 等功率淡出（从前一点落到后一点按 cos(π/2·x)） */
export type GainCurve = 'cosine' | 'equalPowerIn' | 'equalPowerOut';
/** 包络上的一个点：秒（哪条时间轴由用的地方定）、dB（-Infinity = 无声）、从上一点到这一点的过渡（默认 cosine；前后 dB 一样就是保持） */
export type GainPoint = { sec: number; db: number; curve?: GainCurve };
export type GainEnvelope = readonly GainPoint[];

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const toGain = (db: number) => (db === -Infinity ? 0 : 10 ** (db / 20));

const shape = (curve: GainCurve, x: number) =>
  curve === 'equalPowerIn' ? Math.sin((Math.PI / 2) * x) : curve === 'equalPowerOut' ? 1 - Math.cos((Math.PI / 2) * x) : 0.5 - 0.5 * Math.cos(Math.PI * x);

/** 查一条包络：点按秒排、dB 是数（可以 -Infinity）、过渡是认得的 */
export const checkEnvelope = (env: GainEnvelope, label: string) => {
  if (!env.length) throw new Error(`${label}：音量包络至少要一个点`);
  env.forEach((p, i) => {
    if (!Number.isFinite(p.sec)) throw new Error(`${label}：第 ${i + 1} 个点的秒不是有限数（${p.sec}）`);
    if (Number.isNaN(p.db) || p.db === Infinity) throw new Error(`${label}：第 ${i + 1} 个点的 dB 是 ${p.db}`);
    if (p.curve !== undefined && !['cosine', 'equalPowerIn', 'equalPowerOut'].includes(p.curve)) throw new Error(`${label}：第 ${i + 1} 个点的过渡「${p.curve}」不认得`);
    if (i > 0 && p.sec < env[i - 1]!.sec) throw new Error(`${label}：点要按秒排（第 ${i + 1} 个点 ${p.sec} 秒早于前一个 ${env[i - 1]!.sec} 秒）`);
  });
};

/** 包络在第 T 秒的倍数：第一点之前取第一点，最后一点之后取最后一点 */
export const envelopeGain = (env: GainEnvelope, T: number): number => {
  if (T <= env[0]!.sec) return toGain(env[0]!.db);
  for (let i = 1; i < env.length; i++) {
    const [a, b] = [env[i - 1]!, env[i]!];
    if (T >= b.sec) continue;
    const [ga, gb] = [toGain(a.db), toGain(b.db)];
    return ga + (gb - ga) * shape(b.curve ?? 'cosine', (T - a.sec) / (b.sec - a.sec));
  }
  return toGain(env[env.length - 1]!.db);
};

/** 包络表在起放后第 t 秒的倍数 */
export const envelopeTableAt = (e: EnvelopeTable, t: number) => interpTable(e.value, (t - e.startSec) * e.perSec);

/** 资产 cue 起放后第 t 秒实际的增益：段定义.ts 的 cueGain（常数、逐格、淡出）× 包络表 */
export const cueGainAt = (c: AssetCue, t: number) => (c.envelope ? cueGain(c, t) * envelopeTableAt(c.envelope, t) : cueGain(c, t));

/** 包络里音量在变的几截 [起, 止]（前后 dB 一样的是保持，不算；同一秒上跳的算一截长 0 的） */
const ramps = (env: GainEnvelope) => env.slice(1).flatMap((b, i) => (env[i]!.db === b.db ? [] : [[env[i]!.sec, b.sec] as const]));

/**
 * 把几条包络乘到一条资产 cue 上。offsetSec：包络的时间轴比段内秒早多少（场时间线的包络给段窗口的起秒，段内秒的给 0）。
 * 整条 cue 落在常数区：增益（常数或逐格的每一格）乘一个数，倍数是 1 就原样返回。碰到坡道：包络表铺坡道那一截（已有包络表的，铺两截的并、逐格相乘）。
 */
export const applyEnvelopes = (c: AssetCue, envs: readonly GainEnvelope[], offsetSec: number): AssetCue => {
  if (!envs.length) return c;
  const [a, b] = [c.sec, c.sec + c.长秒];
  const at = (segSec: number) => envs.reduce((g, env) => g * envelopeGain(env, segSec + offsetSec), 1);
  const hit = envs.flatMap(ramps).map(([x, y]) => [x - offsetSec, y - offsetSec] as const).filter(([x, y]) => x < b - 1e-9 && y > a + 1e-9);
  if (!hit.length) {
    const k = at((a + b) / 2);
    if (k === 1) return c;
    const g = c.增益;
    return { ...c, 增益: isPerCell(g) ? { ...g, value: g.value.map((v) => round6(v * k)) } : round6((g ?? 1) * k) };
  }
  const old = c.envelope;
  let lo = Math.max(a, Math.min(...hit.map(([x]) => x)));
  let hi = Math.min(b, Math.max(...hit.map(([, y]) => y)));
  if (old) [lo, hi] = [Math.min(lo, a + old.startSec), Math.max(hi, a + old.startSec + (old.value.length - 1) / old.perSec)];
  const k0 = Math.floor(lo * segFps + 1e-9);
  const k1 = Math.ceil(hi * segFps - 1e-9);
  const value = Array.from({ length: k1 - k0 + 1 }, (_, i) => {
    const segSec = (k0 + i) / segFps;
    return round6(at(segSec) * (old ? envelopeTableAt(old, segSec - a) : 1));
  });
  return { ...c, envelope: { perSec: segFps, startSec: k0 / segFps - a, value } };
};
