import { Matrix4, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import type { BedrockBone, BedrockModel, BonePose } from '@engine/model/基岩模型.tsx';
import source from 'asset:模型/角色/娘化亚波伦';
import { dRobeGeometry } from './D版法袍.ts';
import { animSkeletonTable, hover, stand } from './娘化亚波伦.tsx';
import { noodleDancePose } from './动作/忘情牛肉面.ts';

const original = source as unknown as Omit<BedrockModel, 'texture'>;
const model = dRobeGeometry(original, 640);
const bones = new Map(model.bones.map(bone => [bone.name, bone]));
const branches = [[41, 51], [40, 50], [39, 49], [37, 47], [36, 46], [33, 43], [34, 44]];

function corners(bone: BedrockBone, matrix: Matrix4) {
  const cube = bone.cubes![0], inflate = cube.inflate ?? 0;
  return Array.from({ length: 8 }, (_, index) => {
    const coordinates = cube.origin.map((origin, axis) => origin - bone.pivot[axis] +
      ((index >> axis) & 1 ? cube.size[axis] + inflate : -inflate));
    return new Vector3(-coordinates[0], coordinates[1], coordinates[2]).applyMatrix4(matrix);
  });
}

function mirrorResidual(pose: Record<string, BonePose>, local: boolean) {
  const frame = local ? skeletonMatrix(model, 'UpperBody', pose, 1).invert() : new Matrix4();
  const points = (name: string) => corners(bones.get(name)!, frame.clone().multiply(skeletonMatrix(model, name, pose, 1)));
  return Math.max(...branches.flatMap(([positive, negative]) => {
    const opposite = points(`bone${negative}`);
    return points(`bone${positive}`).map((point, index) => new Vector3(-point.x, point.y, point.z).distanceTo(opposite[index ^ 1]));
  }));
}

it('站立和飞行沿身体中线三维对称，原 fly 仍有 30 度开合', () => {
  expect(mirrorResidual({}, false)).toBeLessThan(1e-8);
  for (const sec of [0, 0.5, 1.1667, 1.6667, 2.3333, 2.8333]) {
    const pose = animSkeletonTable(sec, hover);
    expect(mirrorResidual(pose, true)).toBeLessThan(1e-8);
    expect(Math.abs((pose.c1.rot![1] + pose.c2.rot![1]))).toBeLessThan(1e-8);
  }
  expect(animSkeletonTable(1.1667, hover).c1.rot![1]).toBeCloseTo(30);
});

it('转身时保持两道细分叉和外翼末节，不强行抹平世界空间的舞姿', () => {
  const poses = [0, 120, 452, 482, 672, 845].map(frame => ({ ...animSkeletonTable(frame / 60, stand), ...noodleDancePose(frame / 60) }));
  for (const pose of poses) expect(mirrorResidual(pose, true)).toBeLessThan(1e-8);
  expect(Math.max(...poses.map(pose => mirrorResidual(pose, false)))).toBeGreaterThan(1);
});

it('两侧正反面高光及根梢方向对应，不新增骨骼或改变父子关系', () => {
  expect(model.bones.map(bone => [bone.name, bone.parent])).toEqual(original.bones.map(bone => [bone.name, bone.parent]));
  for (const [positive, negative] of branches) {
    const left = bones.get(`bone${positive}`)!.cubes![0].uv, right = bones.get(`bone${negative}`)!.cubes![0].uv;
    if (Array.isArray(left) || Array.isArray(right)) throw new Error('背肢未展开逐面 UV');
    for (const side of ['north', 'south', 'east', 'west', 'up', 'down'] as const) {
      const from = left[side === 'east' ? 'west' : side === 'west' ? 'east' : side]!, to = right[side]!;
      expect(to.uv).toEqual([from.uv[0] + from.uv_size[0], from.uv[1]]);
      expect(to.uv_size).toEqual([-from.uv_size[0], from.uv_size[1]]);
    }
  }
});
