import * as THREE from 'three';
import type { BedrockBone, BonePose } from '@engine/model/基岩模型.tsx';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';

type Model = { bones: readonly BedrockBone[] };
type Pose = Readonly<Record<string, BonePose>>;

const bands = [['bone183', 'bone182', 'bone146', 'bone147'], ['bone184', 'bone181', 'bone94', 'bone99']] as const;
const skirtFront = ['bone27', 'bone28', 'bone29', 'bone30', 'bone31', 'bone32', 'bone125', 'bone126', 'bone127'];
const clearance = 0.12;

const cubeCorners = (bone: BedrockBone) => bone.cubes!.flatMap((cube) => {
  const inset = cube.inflate ?? 0;
  const [width, height, depth] = cube.size;
  const [left, bottom, front] = cube.origin;
  return Array.from({ length: 8 }, (_, index) => new THREE.Vector3(
    bone.pivot[0] - left + (index & 1 ? inset : -width - inset),
    bottom - bone.pivot[1] + (index & 2 ? height + inset : -inset),
    front - bone.pivot[2] + (index & 4 ? depth + inset : -inset),
  ));
});

/** 两条带挂在上身；让腿后的裙前片跟胯。取裙前片最外的支撑面，在带子自己的铰上只转到刚好让开的角度。 */
export const bindFrontBands = (model: Model) => {
  const corners = new Map([...skirtFront, ...bands.flat()].map((name) => [name, cubeCorners(model.bones.find((bone) => bone.name === name)!)]));
  return (pose: Pose): Record<string, BonePose> => {
    const matrix = (name: string) => skeletonMatrix(model, name, pose, 1);
    const worldCorners = (name: string) => {
      const transform = matrix(name);
      return corners.get(name)!.map((point) => point.clone().applyMatrix4(transform));
    };
    const normal = new THREE.Vector3(0, 0, -1).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix('bone27')));
    const outerDepth = Math.max(...skirtFront.flatMap(worldCorners).map((point) => normal.dot(point)));
    const front = new THREE.Plane(normal, -outerDepth - clearance);
    const patch: Record<string, BonePose> = {};
    for (const chain of bands) {
      const hinge = chain[0];
      const toLocal = matrix(hinge).invert();
      const plane = front.clone().applyMatrix4(toLocal);
      const points = chain.flatMap(worldCorners).map((point) => point.applyMatrix4(toLocal));
      const clears = (pitch: number) => {
        const cosine = Math.cos(pitch), sine = Math.sin(pitch);
        return points.every(({ x, y, z }) => plane.constant + plane.normal.x * x
          + plane.normal.y * (cosine * y - sine * z) + plane.normal.z * (sine * y + cosine * z) >= 0);
      };
      if (clears(0)) continue;
      let low = 0, high = Math.PI / 2;
      for (let step = 0; step < 14; step++) {
        const middle = (low + high) / 2;
        if (clears(middle)) high = middle;
        else low = middle;
      }
      const [pitch, yaw, roll] = pose[hinge]?.rot ?? [0, 0, 0];
      patch[hinge] = { rot: [pitch - THREE.MathUtils.radToDeg(high), yaw, roll] };
    }
    return patch;
  };
};
