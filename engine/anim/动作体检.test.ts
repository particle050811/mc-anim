import { expect, it } from 'vitest';
import { auditMotion, type MotionProfile } from './动作体检.ts';

const profile = {
  fps: 60, frames: 24, tracks: { hand: { maxSpeed: 130, checkAlternation: true } }, maxExposure: { hem: 0.01 },
  sample: frame => ({ shot: frame < 12 ? 'wide' : 'close', points: { hand: [frame + (frame < 12 ? 0 : 20), 0, 0] }, clearances: { hem: 0 } }),
} satisfies MotionProfile;
it('按正片帧取样；真切镜清历史，镜内跳位和接缝单帧穿层不豁免', () => {
  expect(auditMotion(profile).findings).toEqual([]);
  const { findings } = auditMotion({ ...profile, sample: frame => ({ ...profile.sample(frame), shot: '不切镜', clearances: { hem: frame === 12 ? 1 : 0 } }) });
  expect(findings.map(issue => [issue.frame, issue.rule])).toEqual([[12, '速度'], [12, '穿出量']]);
});
it('能区分交替重复的姿势样本和正常停拍、真切镜', () => {
  const sample = (frame: number) => ({ ...profile.sample(frame), points: { hand: [2 * Math.floor(frame / 2), 0, 0] as const } });
  const audit = auditMotion({ ...profile, sample });
  expect(audit.findings.map(issue => [issue.shot, issue.first, issue.last])).toEqual([['wide', 10, 11], ['close', 22, 23]]);
  expect(auditMotion({ ...profile, sample: () => sample(0) }).findings).toEqual([]);
});
it('不能把丢失的骨点、碰撞对、坏数当作合格', () => {
  for (const missing of ['points', 'clearances'] as const) {
    const sample = (frame: number) => ({ ...profile.sample(frame), ...(frame === 7 && { [missing]: {} }) });
    expect(() => auditMotion({ ...profile, required: () => ({ points: ['hand'], clearances: ['hem'] }), sample })).toThrow('F7 缺失必测');
  }
  expect(() => auditMotion({ ...profile, sample: frame => ({ ...profile.sample(frame), clearances: {} }) })).toThrow('未采样碰撞对');
  expect(() => auditMotion({ ...profile, sample: frame => ({ ...profile.sample(frame), points: {} }) })).toThrow('未取得相邻帧');
  expect(() => auditMotion({ ...profile, sample: frame => ({ ...profile.sample(frame), points: { hand: [NaN, 0, 0] } }) })).toThrow('F0');
});

// 2-03 绕她那一镜的病（e98e94cc 修）：先快、中途几乎停住、再起。走过的路程用速度积分，速度曲线直接写
const travelled = (speed: (sec: number) => number, frame: number, fps: number) => {
  let x = 0;
  for (let k = 0; k < frame; k++) x += speed((k + 0.5) / fps) / fps;
  return x;
};
const glide = (speed: (sec: number) => number, policy: MotionProfile['tracks'][string]) => ({
  fps: 60, frames: 180, maxExposure: {}, tracks: { cam: policy },
  sample: (frame: number) => ({ shot: 'orbit', points: { cam: [travelled(speed, frame, 60), 0, 0] as const } }),
}) satisfies MotionProfile;
const bump = (from: number, to: number) => (sec: number) => sec <= from || sec >= to ? 0 : Math.sin(Math.PI * (sec - from) / (to - from)) ** 2;
const dipPolicy = { maxSpeed: 100, maxAccel: 600, dip: { minSpeed: 5, maxDepth: 0.6 } };
it('同一镜里先快、几乎停住、再快要报骤降再起；平滑缓入缓出不报；按镜能放行有意的停顿', () => {
  const smooth = auditMotion(glide(sec => 30 * bump(0, 3)(sec), dipPolicy));
  expect(smooth.findings).toEqual([]);
  const stall = (sec: number) => 30 * bump(0, 1.2)(sec) + 0.3 + 12 * bump(1.5, 3)(sec);
  const { findings } = auditMotion(glide(stall, dipPolicy));
  expect(findings.map(issue => [issue.rule, issue.shot])).toEqual([['骤降再起', 'orbit']]);
  expect(findings[0]!.frame).toBeGreaterThan(66); expect(findings[0]!.frame).toBeLessThan(96);
  expect(auditMotion(glide(stall, { ...dipPolicy, shotDipDepth: { orbit: 1 } })).findings).toEqual([]);
  // 两侧都慢（minSpeed 以下）的起伏不算
  expect(auditMotion(glide(sec => stall(sec) / 10, dipPolicy)).findings).toEqual([]);
});
it('一帧里跳一下、速度断崖报加速度；切镜不算', () => {
  const steady = (sec: number) => 6 * Math.min(1, sec);
  expect(auditMotion(glide(steady, dipPolicy)).findings).toEqual([]);
  const jolt = glide(steady, dipPolicy);
  const { findings } = auditMotion({ ...jolt, sample: frame => ({ shot: 'orbit', points: { cam: [jolt.sample(frame).points.cam[0] + (frame === 120 ? 0.3 : 0), 0, 0] as const } }) });
  expect(findings.map(issue => [issue.rule, issue.first, issue.last])).toEqual([['加速度', 120, 122]]);
  const cut = auditMotion({ ...jolt, sample: frame => ({ shot: frame < 120 ? 'a' : 'b', points: { cam: [jolt.sample(frame).points.cam[0] + (frame >= 120 ? 50 : 0), 0, 0] as const } }) });
  expect(cut.findings).toEqual([]);
});
it('朝向轨按角速度查：镜头一帧甩一下要报，匀速摇镜不报', () => {
  const pan = (degPerSec: number, kick = 0) => ({
    fps: 60, frames: 120, maxExposure: {}, tracks: { aim: { maxSpeed: 180, maxAccel: 600, dip: { minSpeed: 20, maxDepth: 0.6 } } },
    sample: (frame: number) => {
      const yaw = (degPerSec * frame / 60 + (frame === 60 ? kick : 0)) * Math.PI / 180;
      return { shot: 'pan', points: {}, directions: { aim: [3 * Math.cos(yaw), 3 * Math.sin(yaw), 0.5] as const } };
    },
  }) satisfies MotionProfile;
  const level = Math.cos(Math.atan2(0.5, 3));
  expect(auditMotion(pan(40)).peaks['aim / 速度 / pan']!.value).toBeCloseTo(40 * level, 1);
  expect(auditMotion(pan(40)).findings).toEqual([]);
  expect(auditMotion(pan(40, 2)).findings.map(issue => [issue.rule, issue.first])).toEqual([['加速度', 60]]);
  expect(() => auditMotion({ ...pan(40), sample: () => ({ shot: 'pan', points: {}, directions: { aim: [0, 0, 0] } }) })).toThrow('无效的朝向');
});
