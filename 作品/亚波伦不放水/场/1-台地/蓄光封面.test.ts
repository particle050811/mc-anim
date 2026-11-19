import { expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { blendLayers } from '@engine/anim/基岩动画.ts';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import { animSkeletonTable, GirlYaBoLunCreature, rightHandCenter } from '../../角色/娘化亚波伦.tsx';
import { hemYieldLeg } from '../../角色/袍摆让腿.ts';
import { withCastingHem } from '../../角色/空中施法袍摆.ts';
import { handVisibility, pupilVisibility } from '../../制作/验掌.ts';
import { projectToScreen } from '../../界面/指杖机位.ts';
import { staffTipPlatePose } from '../../界面/杖尖盘位姿.ts';
import { actStart as openStart, perform as openPerform, steveEye as openingEye, act2WheelParams, wheelPlace, wheelRadius } from './编排-开盘.ts';
import { actDur as openingDuration, beats, toClipSec, toWorldSec } from './开盘拍.ts';
import { castStart, secAt, steveEye } from './齐放拍.ts';
import { castTable, perform, wheelParams } from './编排-齐放.ts';
import { orbitRig, releaseRig } from './绕拍.ts';

it('开盘前摆好右手，开盘到释放只转杖：胸前伸距和肘内角都不变', () => {
  const model = GirlYaBoLunCreature.getModel();
  const releaseFrame = Math.round(castStart * 60);
  const peakFrame = Math.round(openingDuration * 60);
  const openFrame = Math.ceil(toClipSec(beats.openWheelSec) * 60);
  const prepareFrame = Math.floor(toClipSec(beats.staffExtend[0]) * 60);
  const axisAt = (frame: number) => new Vector3(...openPerform.杖(openStart + toWorldSec(frame / 60)).axis);
  for (let frame = prepareFrame + 1; frame <= openFrame; frame++) {
    expect(axisAt(frame).angleTo(axisAt(frame - 1)), `转腕接入 ${frame}`).toBeLessThan(10 * Math.PI / 180);
  }
  let startAxis: Vector3 | undefined, previousPalm: Vector3 | undefined, previousTip: Vector3 | undefined, initialReach: number | undefined;
  for (let frame = openFrame - 2; frame <= peakFrame + releaseFrame + 6; frame++) {
    const release = frame >= peakFrame;
    const sec = (release ? frame - peakFrame : frame) / 60;
    const time = release ? secAt(sec) : openStart + toWorldSec(sec);
    const actor = release ? perform : openPerform;
    const { props } = actor.在(time), wand = actor.杖(time);
    const world = new Matrix4().makeRotationZ(props.pose.yaw * Math.PI / 180).setPosition(...props.pose.loc);
    const bones = blendLayers([{ skeleton: animSkeletonTable(props.sec, props.act) }, { skeleton: props.bonePose }], 'TLM');
    const matrix = (name: string) => world.clone().multiply(skeletonMatrix(model, name, bones, GirlYaBoLunCreature.definition.scale));
    const shoulder = new Vector3().setFromMatrixPosition(matrix('RightArm'));
    const palm = new Vector3(...rightHandCenter(props));
    const reach = palm.clone().sub(shoulder);
    const elbow = new Vector3().setFromMatrixPosition(matrix('RightForeArm'));
    const chestForward = new Vector3(0, 0, -1).transformDirection(matrix('UpBody'));
    const axis = new Vector3(...wand.axis), tip = new Vector3(...wand.tip);
    initialReach ??= reach.dot(chestForward);
    expect(initialReach).toBeGreaterThan(0.23);
    expect(reach.dot(chestForward), `胸前伸距 ${frame}`).toBeCloseTo(initialReach, 3);
    expect(reach.length(), `肩掌距 ${frame}`).toBeCloseTo(0.51387, 3);
    expect(shoulder.clone().sub(elbow).angleTo(palm.clone().sub(elbow)) * 180 / Math.PI, `肘内角 ${frame}`).toBeCloseTo(169.376, 1);
    expect(props.gripOffset).toBeCloseTo(0.87, 6);
    if (frame === openFrame) startAxis = axis;
    if (frame === peakFrame) {
      expect(startAxis!.angleTo(axis)).toBeGreaterThan(Math.PI / 6);
      expect(axis.angleTo(new Vector3(...steveEye).sub(tip)) * 180 / Math.PI).toBeLessThan(1);
    }
    if (frame === peakFrame || frame === peakFrame + 1) {
      expect(palm.distanceTo(previousPalm!), `跨幕右掌 ${frame}`).toBeLessThan(0.04);
      expect(tip.distanceTo(previousTip!), `跨幕杖尖 ${frame}`).toBeLessThan(0.04);
    }
    previousPalm = palm;
    previousTip = tip;
    if (frame >= peakFrame - 22) {
      const target = new Vector3(...(release ? steveEye : openingEye(time))).sub(shoulder);
      expect(reach.angleTo(target) * 180 / Math.PI, `右肩→掌偏离史蒂夫 ${frame}`).toBeLessThan(8);
      expect(reach.clone().setZ(0).angleTo(chestForward.setZ(0)) * 180 / Math.PI, `右臂横出胸前 ${frame}`).toBeLessThan(26);
    }
    if (!release) continue;
    const project = (point: Vector3) => {
      const { x, y } = projectToScreen(releaseRig(sec), 16 / 9, point.toArray());
      return new Vector3(x * 16 / 9, y, 0);
    };
    const screenElbow = project(elbow);
    expect(project(shoulder).sub(screenElbow).angleTo(project(palm).sub(screenElbow)) * 180 / Math.PI, `镜头里仍呈折肘 ${frame}`).toBeGreaterThan(168);
  }
  for (const cast of castTable) {
    const flex = Math.abs(perform.在(cast.sec).props.bonePose.RightForeArm!.rot![0]!);
    expect(flex, `${cast.id} 离杖`).toBeLessThanOrEqual(cast.sec < secAt(castStart + 0.51) ? 12 : 4);
  }
});

it('在实际60帧时间线上取离杖前亮度峰值；整段定杖、出手的双脚保持错开', () => {
  const model = GirlYaBoLunCreature.definition.model as Parameters<typeof skeletonMatrix>[0];
  const openingFrames = Math.round(openingDuration * 60);
  const brightness = new Map<number, number>();
  let minGap = Infinity, maxStep = 0, previous: number[] | undefined;
  for (let frame = 210; frame < openingFrames + 21; frame++) {
    const release = frame >= openingFrames;
    const sec = (release ? frame - openingFrames : frame) / 60;
    const time = release ? secAt(sec) : openStart + toWorldSec(sec);
    const camera = release ? releaseRig(sec) : orbitRig(sec);
    const actor = release ? perform : openPerform;
    const { props } = actor.在(time);
    const wand = actor.杖(time), palm = new Vector3(...rightHandCenter(props));
    const fromTail = palm.clone().sub(new Vector3(...wand.tail)), shaft = new Vector3(...wand.axis);
    expect(fromTail.dot(shaft)).toBeGreaterThan(0);
    expect(fromTail.dot(shaft)).toBeLessThan(new Vector3(...wand.tip).distanceTo(new Vector3(...wand.tail)));
    expect(fromTail.cross(shaft).length()).toBeLessThan(0.6 * 0.7 / 16);
    const disc = release ? wheelParams(time) : act2WheelParams(time);
    if (release && sec >= castStart) expect(disc).toBeNull();
    brightness.set(frame, Math.max(0, ...Object.values(disc?.flash ?? {})));
    const skeleton = blendLayers([{ skeleton: animSkeletonTable(props.sec, props.act) }, { skeleton: props.bonePose }], 'TLM');
    expect(hemYieldLeg(model, skeleton).remain, `袍摆 ${frame}`).toBe(0);
    const world = new Matrix4().makeRotationZ(props.pose.yaw * Math.PI / 180).setPosition(...props.pose.loc);
    if (frame >= 221 && frame <= openingFrames + Math.round(castStart * 60) + 3) {
      const dressed = blendLayers([{ skeleton: animSkeletonTable(props.sec, props.act) }, { skeleton: withCastingHem(props) }], 'TLM');
      for (const hand of ['RightForeArm', 'LeftForeArm'] as const) {
        expect(handVisibility(world, dressed, new Vector3(...camera.pos), hand), `掌面可见点 ${hand} 第${frame}帧`).toBeGreaterThanOrEqual(frame === openingFrames ? 8 : 6);
      }
      if (frame === openingFrames) for (const pupil of ['ysmGlowLeftPupil', 'ysmGlowRightPupil'] as const) {
        expect(pupilVisibility(world, dressed, new Vector3(...camera.pos), pupil), `蓄光封面瞳孔被衣领或头发遮住 ${pupil}`).toBeGreaterThanOrEqual(5);
      }
    }
    if (frame >= 221 && disc) {
      const matrix = (name: string) => world.clone().multiply(skeletonMatrix(model, name, skeleton, GirlYaBoLunCreature.definition.scale));
      const emptyPalm = new Vector3(0.08, -5.78, 0.5).applyMatrix4(matrix('LeftForeArm'));
      const size = (point: Vector3) => projectToScreen(camera, 16 / 9, point.toArray());
      const right = size(palm), left = size(emptyPalm);
      const plate = staffTipPlatePose(wand, wheelPlace), origin = new Vector3(...plate.心), normal = new Vector3(...plate.normal), eye = new Vector3(...camera.pos);
      const rimClearance = (point: Vector3) => {
        const ray = point.clone().sub(eye);
        return eye.clone().addScaledVector(ray, origin.clone().sub(eye).dot(normal) / ray.dot(normal)).distanceTo(origin) - wheelRadius;
      };
      expect(rimClearance(palm), `握杖的右掌被盘盖住 ${frame}`).toBeGreaterThan(0.025);
      expect(rimClearance(emptyPalm), `空的左掌被盘盖住 ${frame}`).toBeGreaterThan(0.015);
      expect(left.x - right.x).toBeGreaterThan(0.035);
      expect(right.y - left.y).toBeGreaterThan(0.075);
      expect(right.depth).toBeLessThan(left.depth - 0.1);
      expect(size(origin).x - right.x).toBeGreaterThan(0.10);
      const rightShoulder = size(new Vector3().setFromMatrixPosition(matrix('RightArm')));
      const leftShoulder = size(new Vector3().setFromMatrixPosition(matrix('LeftArm')));
      expect(rightShoulder.x).toBeLessThan(leftShoulder.x - 0.015);
      expect(rightShoulder.depth).toBeLessThan(leftShoulder.depth);
    }
    const foot = (name: string) => new Vector3().setFromMatrixPosition(world.clone().multiply(skeletonMatrix(model, name, skeleton, GirlYaBoLunCreature.definition.scale)));
    const shoes = ['RightFoot', 'LeftFoot'].map(name => projectToScreen(camera, 16 / 9, foot(name).toArray()));
    const delta = [shoes[0]!.x - shoes[1]!.x, (shoes[0]!.y - shoes[1]!.y) * 9 / 16];
    minGap = Math.min(minGap, Math.hypot(...delta));
    if (previous) maxStep = Math.max(maxStep, Math.hypot(delta[0]! - previous[0]!, delta[1]! - previous[1]!));
    previous = delta;
  }
  expect(minGap).toBeGreaterThan(0.035);
  expect(maxStep).toBeLessThan(0.016);
  const [peakFrame, peak] = [...brightness].sort((first, second) => second[1] - first[1])[0]!;
  expect(peakFrame).toBe(openingFrames);
  expect(peak).toBeGreaterThan(0.99);
});
