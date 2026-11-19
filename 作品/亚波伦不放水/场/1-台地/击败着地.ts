import { Vector3 } from 'three';
import { blendLayers } from '@engine/anim/基岩动画.ts';
import { lerp, smoothstep01 } from '@engine/core/数学.ts';
import type { BedrockModel, BonePose } from '@engine/model/基岩模型.tsx';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import { animSkeletonTable, GirlYaBoLunCreature } from '../../角色/娘化亚波伦.tsx';
import type { PerformanceSnapshot } from '../../角色/动作/亚波伦演出.ts';

const { model, scale } = GirlYaBoLunCreature.definition;
const geometry = model as BedrockModel;
// 两只鞋的方盒有各自的斜面，把顶点先换进踝骨坐标；每帧只需对两只脚做骨骼正解。
const shoes = ['RightFoot', 'LeftFoot'].map((foot) => {
  const inverse = skeletonMatrix(geometry, foot).invert();
  const vertices = geometry.bones.filter((bone) => bone.parent === foot).flatMap((bone) => {
    const relative = inverse.clone().multiply(skeletonMatrix(geometry, bone.name));
    return (bone.cubes ?? []).flatMap(({ origin, size }) => [0, 1].flatMap((width) => [0, 1].flatMap((height) => [0, 1].map((depth) =>
      new Vector3(bone.pivot[0] - origin[0] - width * size[0], origin[1] + height * size[1] - bone.pivot[1], origin[2] + depth * size[2] - bone.pivot[2]).applyMatrix4(relative),
    ))));
  });
  return { foot, vertices };
});

export const soleHeight = (skeleton: Readonly<Record<string, BonePose>>) => Math.min(...shoes.map(({ foot, vertices }) => {
  const matrix = skeletonMatrix(geometry, foot, skeleton, scale);
  return Math.min(...vertices.map((vertex) => vertex.clone().applyMatrix4(matrix).z));
}));

export const absorbLanding = (snapshot: PerformanceSnapshot, sinceContact: number, pathHeight: number): PerformanceSnapshot => {
  const progress = (start: number, end: number) => smoothstep01((sinceContact - start) / (end - start));
  const contact = progress(-0.15, 0);
  if (!contact) return snapshot;
  const pulse = (start: number, peak: number, end: number) => progress(start, peak) * (1 - progress(peak, end));
  const knees = pulse(-0.12, 0.085, 0.47);
  const body = pulse(-0.065, 0.11, 0.41) - 0.23 * pulse(0.21, 0.42, 0.64);
  const arms = pulse(-0.12, 0.15, 0.48) - 0.32 * pulse(0.26, 0.48, 0.74);
  const hem = pulse(-0.1, 0.19, 0.52) - 0.38 * pulse(0.29, 0.54, 0.82);
  const { props } = snapshot;
  const idle = animSkeletonTable(props.sec, props.act);
  const bonePose = { ...props.bonePose };
  const bend = (bone: string, flex: number, tilt = 0) => {
    const rot = bonePose[bone]?.rot ?? idle[bone]?.rot ?? [0, 0, 0];
    bonePose[bone] = { ...bonePose[bone], rot: [rot[0]! + flex, rot[1]!, rot[2]! + tilt] };
  };
  bend('RightLeg', -19 * knees);
  bend('RightLowerLeg', 38 * knees);
  bend('RightFoot', -32 * knees);
  bend('LeftLeg', -15 * knees);
  bend('LeftLowerLeg', 33 * knees);
  bend('LeftFoot', -29 * knees);
  bend('UpBody', 16 * body);
  bend('Head', -8 * body);
  bend('RightArm', -13 * arms, 8 * arms);
  bend('LeftArm', -20 * arms, -15 * arms);
  bend('FrontSkirt', -17 * hem);
  bend('BackSkirt', 20 * hem);
  bend('RightSkirt', 0, 12 * hem);
  bend('LeftSkirt', 0, -12 * hem);
  const sole = soleHeight(blendLayers([{ skeleton: idle }, { skeleton: bonePose }], 'TLM'));
  const [east, north, height] = props.pose.loc;
  return { ...snapshot, props: { ...props, bonePose, pose: { ...props.pose, loc: [east, north, lerp(height, pathHeight - sole, contact)] } } };
};
