// 动作体检（docs/动作体检.md）：按正片帧采样，同一镜里查速度、加速度、骤降再起、停顿、隔帧停走、穿模；切镜清历史，段缝不切镜照常连着查。
// 只给验收用：渲染代码不 import 本文件，改它不动段指纹。
export type MotionPoint = readonly [number, number, number];
export type MotionSample = {
  shot: string;
  points: Record<string, MotionPoint>;
  /** 朝向轨（不必归一，如机位的 tgt − pos）：速度按夹角算，单位度/秒、度/秒² */
  directions?: Record<string, MotionPoint>;
  clearances?: Record<string, number>;
};
/**
 * 骤降再起：某帧速度比它前后 windowSec 内各自的最快都低得多。降幅 = 1 − 该帧速度 ÷ 两侧最快里较小的那个，
 * 两侧最快都不到 minSpeed 不算（慢动作里的小起伏）。降幅 > maxDepth 报；有意的定格、蓄力按镜在 shotDipDepth 里给 1 放行。
 */
export type DipPolicy = { minSpeed: number; maxDepth: number; windowSec?: number };
export type TrackPolicy = {
  maxSpeed: number; shotSpeed?: Record<string, number>;
  /** 相邻两帧速度矢量之差 × fps（点轨格/秒²，朝向轨度/秒²）：一帧里跳一下、速度断崖都落在这里 */
  maxAccel?: number; shotAccel?: Record<string, number>;
  dip?: DipPolicy; shotDipDepth?: Record<string, number>;
  maxHoldSec?: number; shotHoldSec?: Record<string, number>; checkAlternation?: boolean;
};
export type MotionProfile = {
  fps: number;
  frames: number;
  tracks: Record<string, TrackPolicy>;
  maxExposure: Record<string, number>;
  required?: (frame: number, shot: string) => { points?: readonly string[]; directions?: readonly string[]; clearances?: readonly string[] };
  sample: (frame: number, sec: number) => MotionSample;
};
export type MotionFinding = { track: string; rule: string; shot: string; first: number; last: number; worst: number; frame: number; limit: number };

type V = readonly number[];
const sub = (a: V, b: V) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!] as const;
const norm = (a: V) => Math.hypot(a[0]!, a[1]!, a[2]!);
const cross = (a: V, b: V) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!] as const;
/** 从 a 转到 b 的角速度矢量（度/秒）：转轴 × 夹角 × fps */
const turnRate = (a: V, b: V, fps: number) => {
  const axis = cross(a, b), sin = norm(axis), angle = Math.atan2(sin, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!);
  return sin < 1e-12 ? [0, 0, 0] as const : axis.map(value => (value / sin) * angle * (180 / Math.PI) * fps);
};

export const auditMotion = (profile: MotionProfile, observe?: (frame: number, sample: MotionSample) => void) => {
  if (!(Number.isFinite(profile.fps) && profile.fps > 0 && Number.isSafeInteger(profile.frames) && profile.frames > 1)) throw Error('动作体检：无效的采样钟');
  const findings: MotionFinding[] = [];
  const latest = new Map<string, MotionFinding>();
  const peaks: Record<string, { value: number; frame: number; samples: number }> = {};
  const holds = new Map<string, number>();
  const histories = new Map<string, number[]>();
  const velocities = new Map<string, V>();
  /** 本镜里各轨每帧的速度，切镜或收尾时查骤降再起（要看后面的帧） */
  const series = new Map<string, { frame: number; speed: number }[]>();
  const note = (track: string, rule: string, shot: string, frame: number, value: number, limit: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(limit) || limit < 0) throw Error(`F${frame} ${track} ${rule} 非有限值或阈值无效`);
    const key = JSON.stringify([track, rule, shot]);
    const label = `${track} / ${rule} / ${shot}`;
    const peak = peaks[label] ??= { value, frame, samples: 0 };
    peak.samples++;
    if (value > peak.value) Object.assign(peak, { value, frame });
    if (value <= limit) return;
    const prior = latest.get(key);
    if (prior && prior.last === frame - 1) {
      prior.last = frame;
      if (value > prior.worst) Object.assign(prior, { worst: value, frame });
    } else {
      const finding = { track, rule, shot, first: frame, last: frame, frame, worst: value, limit };
      latest.set(key, finding); findings.push(finding);
    }
  };
  const checkDip = (name: string, shot: string, list: readonly { frame: number; speed: number }[]) => {
    const policy = profile.tracks[name]!, dip = policy.dip!;
    const limit = policy.shotDipDepth?.[shot] ?? dip.maxDepth, reach = Math.round((dip.windowSec ?? 1) * profile.fps);
    list.forEach(({ frame, speed }, index) => {
      let before = 0, after = 0;
      for (let k = Math.max(0, index - reach); k <= index; k++) before = Math.max(before, list[k]!.speed);
      for (let k = index; k <= Math.min(list.length - 1, index + reach); k++) after = Math.max(after, list[k]!.speed);
      const base = Math.min(before, after);
      note(name, '骤降再起', shot, frame, base > 0 && base >= dip.minSpeed ? 1 - speed / base : 0, limit);
    });
  };
  const checkDips = (shot: string) => { for (const [name, list] of series) checkDip(name, shot, list); series.clear(); };
  let previous: MotionSample | undefined;
  const cuts: { frame: number; shot: string }[] = [];
  const seen = new Set<string>(), compared = new Set<string>();
  for (let frame = 0; frame < profile.frames; frame++) {
    const now = profile.sample(frame, frame / profile.fps);
    if (!now.shot) throw Error(`F${frame} 缺少实际镜头名`);
    if (now.shot !== previous?.shot) {
      if (previous) checkDips(previous.shot);
      previous = undefined; holds.clear(); histories.clear(); velocities.clear(); cuts.push({ frame, shot: now.shot });
    }
    observe?.(frame, now);
    const required = profile.required?.(frame, now.shot);
    for (const name of required?.points ?? []) if (!Object.hasOwn(now.points, name)) throw Error(`F${frame} 缺失必测骨点 ${name}`);
    for (const name of required?.directions ?? []) if (!Object.hasOwn(now.directions ?? {}, name)) throw Error(`F${frame} 缺失必测朝向 ${name}`);
    for (const name of required?.clearances ?? []) if (!Object.hasOwn(now.clearances ?? {}, name)) throw Error(`F${frame} 缺失必测碰撞对 ${name}`);
    const tracks = [...Object.entries(now.points).map(([name, point]) => [name, point, false] as const), ...Object.entries(now.directions ?? {}).map(([name, point]) => [name, point, true] as const)];
    for (const [name, point, isDirection] of tracks) {
      const policy = profile.tracks[name];
      if (!policy || point.length !== 3 || !point.every(Number.isFinite) || isDirection && norm(point) < 1e-9) throw Error(`F${frame} 未配置或无效的${isDirection ? '朝向' : '骨点'} ${name}`);
      if (isDirection && Object.hasOwn(now.points, name)) throw Error(`F${frame} ${name} 同时是骨点和朝向`);
      const before = isDirection ? previous?.directions?.[name] : previous?.points[name];
      const velocity = before && (isDirection ? turnRate(before, point, profile.fps) : sub(point, before).map(value => value * profile.fps));
      const speed = velocity && norm(velocity);
      if (speed !== undefined) { note(name, '速度', now.shot, frame, speed, policy.shotSpeed?.[now.shot] ?? policy.maxSpeed); compared.add(name); }
      const lastVelocity = velocities.get(name);
      if (velocity && lastVelocity && policy.maxAccel !== undefined) note(name, '加速度', now.shot, frame, norm(sub(velocity, lastVelocity)) * profile.fps, policy.shotAccel?.[now.shot] ?? policy.maxAccel);
      if (velocity) velocities.set(name, velocity); else velocities.delete(name);
      if (policy.dip && speed !== undefined) {
        const list = series.get(name) ?? [];
        if (list.length && list.at(-1)!.frame !== frame - 1) { checkDip(name, now.shot, list); list.length = 0; }
        list.push({ frame, speed }); series.set(name, list);
      }
      if (policy.checkAlternation) {
        const history = before ? histories.get(name) ?? [] : [];
        if (speed !== undefined) history.push(speed);
        if (history.length > 10) history.shift();
        histories.set(name, history);
        if (history.length === 10) {
          const slow = Math.min(...history), fast = Math.max(...history);
          // 连续五对近乎「停、动」才报，孤立停拍、缓入缓出不算 30→60 的重复帧。
          const staggered = fast > 1e-4 && slow < fast * 0.01 && history.every((value, index) => !index || (value < fast * 0.01) !== (history[index - 1]! < fast * 0.01));
          if (staggered) note(name, '隔帧停走', now.shot, frame, 5, 4);
        }
      }
      const held = speed !== undefined && speed <= 1e-8 ? (holds.get(name) ?? 0) + 1 : 0;
      holds.set(name, held);
      const maxHold = policy.shotHoldSec?.[now.shot] ?? policy.maxHoldSec;
      if (maxHold !== undefined) note(name, '停顿秒数', now.shot, frame, held / profile.fps, maxHold);
    }
    for (const [name, exposure] of Object.entries(now.clearances ?? {})) {
      const limit = profile.maxExposure[name];
      if (limit === undefined) throw Error(`F${frame} 未配置的碰撞对 ${name}`);
      note(name, '穿出量', now.shot, frame, exposure, limit); seen.add(name);
    }
    previous = now;
  }
  if (previous) checkDips(previous.shot);
  for (const name of Object.keys(profile.tracks)) if (!compared.has(name)) throw Error(`未取得相邻帧：${name}`);
  for (const name of Object.keys(profile.maxExposure)) if (!seen.has(name)) throw Error(`未采样碰撞对：${name}`);
  if (!compared.size) throw Error('没有可比较的动作轨');
  findings.sort((a, b) => a.first - b.first);
  return { fps: profile.fps, frames: profile.frames, cuts, peaks, findings };
};
