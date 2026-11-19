import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { blendLayers } from '@engine/anim/基岩动画.ts';
import { castingSkirtProbe } from './施法裙体检.ts';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import { actDur as openingDuration, toWorldSec } from '../场/1-台地/开盘拍.ts';
import { actStart, perform as opening } from '../场/1-台地/编排-开盘.ts';
import { actDur as volleyDuration, perform as volley, secAt } from '../场/1-台地/编排-齐放.ts';
import { animSkeletonTable, GirlYaBoLunCreature } from './娘化亚波伦.tsx';
import { withCastingHem } from './空中施法袍摆.ts';

const model = GirlYaBoLunCreature.getModel();
const measure = castingSkirtProbe();

it('施法实模：从飞行到开盘和齐放，裙缘不翻起，腿鞋不越过裙面', () => {
  for (const [label, actor, frames, time] of [
    ['开盘', opening, Math.round(openingDuration * 60), (frame: number) => actStart + toWorldSec(frame / 60)],
    ['齐放', volley, Math.round(volleyDuration * 60), (frame: number) => secAt(frame / 60)],
  ] as const) {
    let peakRise = 0, peakExposure = 0, maxKnee = 0, minStagger = Infinity, maxStagger = 0;
    for (let frame = 0; frame < frames; frame++) {
      const { props } = actor.在(time(frame));
      const pose = blendLayers([{ skeleton: animSkeletonTable(props.sec, props.act) }, { skeleton: withCastingHem(props) }], 'TLM');
      const result = measure(pose);
      const context = `${label} ${frame}`;
      expect(result.rise, `${context} 裙缘比静置抬高（模型像素）`).toBeLessThan(1);
      expect(result.swing, `${context} 裙缘横向甩离静置位置（模型像素）`).toBeLessThan(1.5);
      expect(result.exposure, `${context} 腿鞋凸出裙面，高度/方向 ${result.where}`).toBeLessThan(1e-5);
      const pelvis = skeletonMatrix(model, 'DownBody', pose, 1).invert();
      const foot = (name: string) => new Vector3().setFromMatrixPosition(pelvis.clone().multiply(skeletonMatrix(model, name, pose, 1)));
      const stagger = foot('LeftFoot').z - foot('RightFoot').z;
      const knee = Math.max(...['LeftLowerLeg', 'RightLowerLeg'].map(name => Math.abs(pose[name]!.rot![0]!)));
      expect(knee, `${context} 屈膝角`).toBeLessThan(16);
      expect(stagger, `${context} 前后脚错位（模型像素）`).toBeGreaterThan(1);
      expect(stagger, `${context} 跨步过大（模型像素）`).toBeLessThan(7);
      peakRise = Math.max(peakRise, result.rise);
      peakExposure = Math.max(peakExposure, result.exposure);
      maxKnee = Math.max(maxKnee, knee);
      minStagger = Math.min(minStagger, stagger);
      maxStagger = Math.max(maxStagger, stagger);
    }
    console.log(`${label} ${frames} 帧：裙缘最大抬升 ${peakRise.toFixed(3)}，腿鞋最大外露 ${peakExposure.toFixed(3)}，前后脚 ${minStagger.toFixed(2)}–${maxStagger.toFixed(2)} 模型像素，最大屈膝 ${maxKnee.toFixed(1)}°`);
  }
});

it('实模检测会报翻裙、单独穿出的小腿和鞋，不把正常从裙底露出的鞋当成穿模', () => {
  const { props } = volley.在(secAt(0));
  const pose = blendLayers([{ skeleton: animSkeletonTable(props.sec, props.act) }, { skeleton: withCastingHem(props) }], 'TLM');
  expect(measure(pose).exposure).toBe(0);
  expect(measure({ ...pose, FrontSkirt: { rot: [-60, 0, 0] } }).rise).toBeGreaterThan(6);
  expect(measure({ ...pose, RightLowerLeg: { rot: [-70, 0, 0] } }).exposure).toBeGreaterThan(1);
  expect(measure({ ...pose, RightFoot: { pos: [0, 9, -6] } }).exposure).toBeGreaterThan(1);
});
