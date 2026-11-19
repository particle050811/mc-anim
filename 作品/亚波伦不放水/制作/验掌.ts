import { DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { boneGeometry, type BonePose } from '@engine/model/基岩模型.tsx';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import { GirlYaBoLunCreature } from '../角色/娘化亚波伦.tsx';

const model = GirlYaBoLunCreature.getModel();
const material = new MeshBasicMaterial({ side: DoubleSide });
const meshes = model.bones.flatMap(bone => {
  const geometry = boneGeometry(bone, model.texW, model.texH);
  if (!geometry) return [];
  const mesh = new Mesh(geometry, material);
  mesh.name = bone.name;
  return [mesh];
});

const visibleSamples = (world: Matrix4, bones: Readonly<Record<string, BonePose>>, camera: Vector3, part: string, samples: Vector3[], accepts: (red: number, green: number, blue: number) => boolean) => {
  for (const mesh of meshes) mesh.matrixWorld.multiplyMatrices(world, skeletonMatrix(model, mesh.name, bones, GirlYaBoLunCreature.definition.scale));
  const basis = meshes.find(mesh => mesh.name === part)!.matrixWorld;
  const { w, h, px } = model.texture;
  const ray = new Raycaster();
  let visible = 0;
  for (const sample of samples) {
    const target = sample.clone().applyMatrix4(basis);
    ray.set(camera, target.clone().sub(camera).normalize());
    ray.far = camera.distanceTo(target) + 0.01;
    for (const hit of ray.intersectObjects(meshes, false)) {
      const uv = hit.uv!;
      const offset = 4 * (Math.min(h - 1, Math.max(0, Math.floor(uv.y * h))) * w + Math.min(w - 1, Math.max(0, Math.floor(uv.x * w))));
      if (px[offset + 3]! < 128) continue;
      if (hit.object.name === part && accepts(px[offset]!, px[offset + 1]!, px[offset + 2]!)) visible++;
      break;
    }
  }
  return visible;
};

const handSamples = [-0.65, 0, 0.65].flatMap(across => [-6.10, -5.78, -5.46].map(along => new Vector3(across, along, 0.5)));
export const handVisibility = (world: Matrix4, bones: Readonly<Record<string, BonePose>>, camera: Vector3, hand: 'RightForeArm' | 'LeftForeArm') =>
  visibleSamples(world, bones, camera, hand, handSamples, (red, green, blue) => red > 160 && green > 120 && blue > 75);

export const pupilVisibility = (world: Matrix4, bones: Readonly<Record<string, BonePose>>, camera: Vector3, pupil: 'ysmGlowLeftPupil' | 'ysmGlowRightPupil') => {
  const bone = model.bones.find(part => part.name === pupil)!;
  const {origin, size} = bone.cubes![0]!;
  const samples = [0.38, 0.5, 0.62].flatMap(across => [0.32, 0.5, 0.68].map(along => new Vector3(bone.pivot[0] - origin[0] - size[0] * across, origin[1] + size[1] * along - bone.pivot[1], origin[2] - bone.pivot[2])));
  return visibleSamples(world, bones, camera, pupil, samples, () => true);
};
