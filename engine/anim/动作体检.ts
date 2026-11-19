export type MotionPoint = readonly [number, number, number];
export type MotionSample = {
  shot: string;
  points: Record<string, MotionPoint>;
  clearances?: Record<string, number>;
};
export type MotionProfile = {
  fps: number;
  frames: number;
  tracks: Record<string, { maxSpeed: number; shotSpeed?: Record<string, number>; maxHoldSec?: number; shotHoldSec?: Record<string, number>; checkAlternation?: boolean }>;
  maxExposure: Record<string, number>;
  required?: (frame: number, shot: string) => { points?: readonly string[]; clearances?: readonly string[] };
  sample: (frame: number, sec: number) => MotionSample;
};
export type MotionFinding = { track: string; rule: string; shot: string; first: number; last: number; worst: number; frame: number; limit: number };

export const auditMotion = (profile: MotionProfile, observe?: (frame: number, sample: MotionSample) => void) => {
  if (!(Number.isFinite(profile.fps) && profile.fps > 0 && Number.isSafeInteger(profile.frames) && profile.frames > 1)) throw Error('动作体检：无效的采样钟');
  const findings: MotionFinding[] = [];
  const latest = new Map<string, MotionFinding>();
  const peaks: Record<string, { value: number; frame: number; samples: number }> = {};
  const holds = new Map<string, number>();
  const histories = new Map<string, number[]>();
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
  let previous: MotionSample | undefined;
  const cuts: { frame: number; shot: string }[] = [];
  const seen = new Set<string>(), compared = new Set<string>();
  for (let frame = 0; frame < profile.frames; frame++) {
    const now = profile.sample(frame, frame / profile.fps);
    if (!now.shot) throw Error(`F${frame} 缺少实际镜头名`);
    if (now.shot !== previous?.shot) { previous = undefined; holds.clear(); histories.clear(); cuts.push({ frame, shot: now.shot }); }
    observe?.(frame, now);
    const required = profile.required?.(frame, now.shot);
    for (const name of required?.points ?? []) if (!Object.hasOwn(now.points, name)) throw Error(`F${frame} 缺失必测骨点 ${name}`);
    for (const name of required?.clearances ?? []) if (!Object.hasOwn(now.clearances ?? {}, name)) throw Error(`F${frame} 缺失必测碰撞对 ${name}`);
    for (const [name, point] of Object.entries(now.points)) {
      const policy = profile.tracks[name];
      if (!policy || point.length !== 3 || !point.every(Number.isFinite)) throw Error(`F${frame} 未配置或无效的骨点 ${name}`);
      const before = previous?.points[name];
      const speed = before && Math.hypot(...point.map((value, axis) => value - before[axis]!)) * profile.fps;
      if (speed !== undefined) { note(name, '速度', now.shot, frame, speed, policy.shotSpeed?.[now.shot] ?? policy.maxSpeed); compared.add(name); }
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
  for (const name of Object.keys(profile.tracks)) if (!compared.has(name)) throw Error(`未取得相邻帧：${name}`);
  for (const name of Object.keys(profile.maxExposure)) if (!seen.has(name)) throw Error(`未采样碰撞对：${name}`);
  if (!compared.size) throw Error('没有可比较的动作轨');
  return { fps: profile.fps, frames: profile.frames, cuts, peaks, findings };
};
