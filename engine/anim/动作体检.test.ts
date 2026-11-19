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
