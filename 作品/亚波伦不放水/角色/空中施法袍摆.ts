import { blendLayers } from '@engine/anim/基岩动画.ts';
import { animSkeletonTable, GirlYaBoLunCreature } from './娘化亚波伦.tsx';
import { hemYieldLeg } from './袍摆让腿.ts';
import type { PerformanceSnapshot } from './动作/亚波伦演出.ts';

const model = GirlYaBoLunCreature.definition.model as Parameters<typeof hemYieldLeg>[0];

export const withCastingHem = ({ sec, act, bonePose, castingFlightLegs }: PerformanceSnapshot['props']) => {
  if (!castingFlightLegs) {
    const skeleton = blendLayers([{ skeleton: animSkeletonTable(sec, act) }, { skeleton: bonePose }], 'TLM');
    return { ...bonePose, ...hemYieldLeg(model, skeleton).bonePose };
  }
  const drift = (bone: string, axis: number) => 2 * Math.tanh((bonePose[bone]?.rot?.[axis] ?? 0) / 18);
  return {
    ...bonePose,
    Skirt: { scale: [1, 1.09, 1] },
    FrontSkirt: { rot: [2 + drift('FrontSkirt', 0), 0, 0] },
    BackSkirt: { rot: [2 + drift('BackSkirt', 0), 0, 0] },
    LeftSkirt: { rot: [0, 0, drift('LeftSkirt', 2)] },
    RightSkirt: { rot: [0, 0, drift('RightSkirt', 2)] },
  };
};
