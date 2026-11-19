import type { BonePose } from '@engine/model/基岩模型.tsx';

type LegBones = Readonly<Record<string, BonePose>>;

const hangingLegs = (front: number, frontKnee: number, back: number, backKnee: number, spread = 1): LegBones => ({
  RightLeg: { rot: [front, 0, spread] }, RightLowerLeg: { rot: [frontKnee, 0, 0] },
  LeftLeg: { rot: [back, 0, -spread] }, LeftLowerLeg: { rot: [backKnee, 0, 0] },
});

const aim = hangingLegs(-7, 5, 4, 6, 3), release = hangingLegs(-8, 5, 5, 6, 3);
const castingLegs = {
  起飞: hangingLegs(-7, 12, -3, 9), 飞行: hangingLegs(-4, 5, 4, 8), 瞬移收: hangingLegs(-6, 10, 2, 7),
  悬停: hangingLegs(-3, 4, 2, 4), 升空: hangingLegs(-5, 7, 3, 7), 升指: hangingLegs(-6, 6, 4, 7),
  '侧身定杖': aim, '侧身离杖': release, '连射': aim, 开盘: release,
};

export const withCastingLegs = <Pose extends { 手: LegBones }, Name extends string>(poses: Record<Name | keyof typeof castingLegs, Pose>) => {
  const dressed = { ...poses };
  for (const name of Object.keys(castingLegs) as (keyof typeof castingLegs)[]) {
    dressed[name] = { ...poses[name], 手: { ...poses[name].手, ...castingLegs[name] } };
  }
  return dressed;
};
