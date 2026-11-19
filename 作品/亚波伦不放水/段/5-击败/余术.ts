import { revelationCageOpacity } from '@库/特效/炼狱结界线.ts';
import { spellDuration } from '../../法术/演出/接口.ts';
import { getSpellMeta } from '../../法术/演出/元表.ts';
import { holdWandPose } from '../../角色/娘化亚波伦.tsx';
import { launchFrom, launchTarget, type Launch } from '../../场/1-台地/出手表.ts';
import { actStart } from '../../场/1-台地/击败拍.ts';
import { performAt } from '../../场/1-台地/编排-击败.ts';
import { cageSetup, castTable, sceneCtx, throwSec } from '../../场/1-台地/编排-齐放.ts';

export const tailSceneCtx = {
  ...sceneCtx,
  casterFoot: (sec: number) => sec < actStart ? sceneCtx.casterFoot(sec) : performAt(sec).props.pose.loc,
  wandTip: (sec: number) => sec < actStart ? sceneCtx.wandTip(sec) : holdWandPose(performAt(sec).props).tip,
};

export const remainingVolley = (): Launch[] => castTable.flatMap((cast, index) => {
  if (cast.sec >= actStart || (cast.end !== undefined && cast.end <= actStart)) return [];
  const from = launchFrom(cast, sceneCtx);
  const target = launchTarget(cast, sceneCtx);
  const age = (cast.clock?.(actStart) ?? actStart) - cast.sec;
  const lifetime = spellDuration(getSpellMeta(cast.id), cast.follow?.(actStart) ?? from, target, cast.options).长秒;
  if (age >= lifetime) return [];
  const end = cast.clock ? cast.end : Math.min(cast.end ?? Infinity, cast.sec + lifetime);
  return [{ ...cast, from, target, end, seed: cast.seed ?? 101 + index * 7, ...(cast.follow && { follow: tailSceneCtx.wandTip }) }];
});

export const cageTailAt = (sec: number) => {
  const age = sec - throwSec;
  return {
    center: cageSetup.target,
    radiusFactor: cageSetup.fullRadiusFactor,
    spinSec: age + cageSetup.spinPhaseSec,
    opacity: revelationCageOpacity(age * 20, (actStart - throwSec) * 20),
  };
};
