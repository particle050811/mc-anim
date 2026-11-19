import { blendLayers } from '@engine/anim/基岩动画.ts';
import type { BedrockBone, BonePose } from '@engine/model/基岩模型.tsx';
import { animSkeletonTable, defineAct, GirlYaBoLunCreature } from './娘化亚波伦.tsx';
import { noodleDanceEnv, noodleDancePose } from './动作/忘情牛肉面.ts';
import { danceFormat, parseDanceRevision, sampleDanceRevision } from './动作/Blender舞轨.ts';
import revisionFile from './动作/Blender修订.json';
import { hemYieldLeg } from './袍摆让腿.ts';
import { bindFrontBands } from './前襟让裙摆.ts';
import { bindDanceEyeRing } from './舞时眼形环.ts';

const geometry = GirlYaBoLunCreature.definition.model as { bones: BedrockBone[] };
const frontBandPose = bindFrontBands(geometry);
const eyeRingPose = bindDanceEyeRing(geometry);
const revision = parseDanceRevision(revisionFile, new Set(geometry.bones.map(bone => bone.name)));
export const settlementAct = defineAct({ 主: () => [{ name: 'idle' }], env: noodleDanceEnv });

type Pose = Record<string, BonePose>;
export const composeDanceLayers = (base: Pose, overlay: Pose) => blendLayers([{ skeleton: base }, { skeleton: overlay }], 'TLM');

export const settlementRig = (danceSec: number, edits = revision) => {
  const sec = Math.max(0, danceSec);
  const animation = animSkeletonTable(sec, settlementAct);
  const patch = sampleDanceRevision(edits, danceSec * danceFormat.fps);
  const override = (pose: Pose) => Object.keys(patch).length ? composeDanceLayers(pose, patch) : pose;
  const body = override(noodleDancePose(danceSec));
  const posed = composeDanceLayers(animation, body);
  const hem = hemYieldLeg(geometry, posed).bonePose;
  const dressed = override({ ...posed, ...hem });
  const bonePose = override({ ...body, ...hem, ...frontBandPose(dressed), ...eyeRingPose(posed) });
  return { sec, animation, bonePose };
};
