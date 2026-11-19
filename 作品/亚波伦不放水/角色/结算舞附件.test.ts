import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { blendLayers } from '@engine/anim/基岩动画.ts';
import type { BedrockBone, BonePose } from '@engine/model/基岩模型.tsx';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import { segFps } from '@engine/段/段定义.ts';
import { noodleDanceEnv, noodleDancePose } from './动作/忘情牛肉面.ts';
import { animSkeletonTable, defineAct, GirlYaBoLunCreature } from './娘化亚波伦.tsx';
import { hemYieldLeg } from './袍摆让腿.ts';
import { bindFrontBands } from './前襟让裙摆.ts';
import { bindDanceEyeRing } from './舞时眼形环.ts';
import seg from '../段/6-结算舞/段.ts';

const model = GirlYaBoLunCreature.definition.model as { bones: BedrockBone[] };
const bones = new Map(model.bones.map(bone => [bone.name, bone]));
const act = defineAct({ 主: () => [{ name: 'idle' }], env: noodleDanceEnv });
const frameCount = Math.round(seg.sec * segFps);
const dancePose = (frame: number) => blendLayers([
  { skeleton: animSkeletonTable(frame / segFps, act) }, { skeleton: noodleDancePose(frame / segFps) },
], 'TLM');
const bandsAt = bindFrontBands(model);
const ringAt = bindDanceEyeRing(model);
const beltBones = ['bone183', 'bone182', 'bone146', 'bone147', 'bone184', 'bone181', 'bone94', 'bone99'];
const inSkirt = (bone: BedrockBone): boolean => bone.name === 'Skirt' || !!bone.parent && inSkirt(bones.get(bone.parent)!);
const boxBounds = (bone: BedrockBone) => {
  const cube = bone.cubes![0]!;
  const min = new THREE.Vector3(...cube.origin).sub(new THREE.Vector3(...bone.pivot));
  const max = min.clone().add(new THREE.Vector3(...cube.size));
  return new THREE.Box3(new THREE.Vector3(-max.x, min.y, min.z), new THREE.Vector3(-min.x, max.y, max.z)).expandByScalar(cube.inflate ?? 0);
};
const triangles = new THREE.BoxGeometry(1, 1, 1).toNonIndexed().getAttribute('position');
const skirt = model.bones.filter(bone => bone.cubes?.length && inSkirt(bone)).map(bone => {
  const box = boxBounds(bone);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  return { name: bone.name, box, vertices: Array.from({ length: triangles.count }, (_, index) =>
    new THREE.Vector3().fromBufferAttribute(triangles, index).multiply(size).add(center)) };
});

/** 从每块带子的背面向正面延伸成棱柱；裙片若进入棱柱，带子就相交或被盖住（不仅查角点）。 */
const blockedBands = (pose: Record<string, BonePose>) => {
  const panels = skirt.map(panel => ({ ...panel, matrix: skeletonMatrix(model, panel.name, pose, 1) }));
  return beltBones.filter(name => {
    const box = boxBounds(bones.get(name)!);
    box.min.z = -100;
    const inverse = skeletonMatrix(model, name, pose, 1).invert();
    return panels.some(panel => {
      const local = inverse.clone().multiply(panel.matrix);
      if (!box.intersectsBox(panel.box.clone().applyMatrix4(local))) return false;
      const points = panel.vertices.map(point => point.clone().applyMatrix4(local));
      for (let index = 0; index < points.length; index += 3) {
        if (box.intersectsTriangle(new THREE.Triangle(points[index], points[index + 1], points[index + 2]))) return true;
      }
      return false;
    });
  });
};

describe('正片结算舞附件', () => {
  it('草地舞中两条带尖都曾受遮挡，修正后所有帧都在裙外，只动带子的铰', () => {
    const occluded = new Set<string>();
    for (let frame = 0; frame < frameCount; frame++) {
      const body = dancePose(frame);
      const pose = { ...body, ...hemYieldLeg(model, body).bonePose };
      for (const band of blockedBands(pose)) occluded.add(band);
      const patch = bandsAt(pose);
      expect(Object.keys(patch).every(name => ['bone183', 'bone184'].includes(name))).toBe(true);
      for (const correction of Object.values(patch)) expect(Math.abs(correction.rot![0]), `第 ${frame} 帧`).toBeLessThan(65);
      expect(blockedBands({ ...pose, ...patch }), `第 ${frame} 帧`).toEqual([]);
    }
    expect([...occluded]).toEqual(expect.arrayContaining(['bone147', 'bone99']));
  }, 120_000);

  it('从起舞到收势，眼形环在真实 Head 空间位置和方向恒定，环底不压帽冠', () => {
    const relative = (pose: Record<string, BonePose>, name: string) => skeletonMatrix(model, 'Head', pose, 1).invert().multiply(skeletonMatrix(model, name, pose, 1));
    const initial = relative(ringAt({}), 'ysmGlowbone24');
    const ring = bones.get('ysmGlowbone24')!, hat = bones.get('mao')!;
    const bottom = Math.min(...ring.cubes!.map(cube => cube.origin[1] - ring.pivot[1])) + initial.elements[13];
    const top = Math.max(...hat.cubes!.map(cube => cube.origin[1] + cube.size[1] - hat.pivot[1])) + relative({}, 'mao').elements[13];
    expect(bottom - top).toBeGreaterThan(2);
    expect(bottom - top).toBeLessThan(3);
    for (let frame = 0; frame < frameCount; frame++) {
      const body = dancePose(frame);
      const patch = ringAt(body);
      expect(Object.keys(patch)).toEqual(['ysmGlowbone24']);
      const matrix = relative({ ...body, ...patch }, 'ysmGlowbone24');
      expect(Math.max(...matrix.elements.map((value, index) => Math.abs(value - initial.elements[index]))), `第 ${frame} 帧`).toBeLessThan(1e-8);
    }
  });
});
