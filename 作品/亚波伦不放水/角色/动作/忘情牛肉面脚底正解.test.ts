import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { blendLayers } from '@engine/anim/基岩动画.ts';
import { makeCamera, projectToPicture } from '@engine/core/three换算.ts';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import { boneGeometry, type BedrockBone, type BonePose } from '@engine/model/基岩模型.tsx';
import { animSkeletonTable, GirlYaBoLunCreature, stand } from '../娘化亚波伦.tsx';
import { composeDanceLayers, settlementRig } from '../结算舞姿势.ts';
import { danceAt, solveSkeleton, type DancePose } from './忘情牛肉面.ts';

const model = GirlYaBoLunCreature.definition.model as { bones: BedrockBone[] };
const scale = GirlYaBoLunCreature.definition.scale!;
const placement = new THREE.Matrix4().makeRotationZ(Math.PI).setPosition(3, -4, 9);
const base = animSkeletonTable(0.6, stand);
const scenePose = (pose: DancePose) => blendLayers([{ skeleton: base }, { skeleton: solveSkeleton(pose) }], 'TLM');
const origin = (name: string, pose: Record<string, BonePose>) => new THREE.Vector3().setFromMatrixPosition(skeletonMatrix(model, name, pose, 1));

const shoeVertices = (side: string, pose: Record<string, BonePose>) => model.bones.filter(bone => bone.parent === `${side}Foot`).flatMap(bone => {
  const matrix = skeletonMatrix(model, bone.name, pose, 1);
  return bone.cubes!.flatMap(cube => Array.from({ length: 8 }, (_, corner) => {
    const point = new THREE.Vector3(...cube.origin);
    for (const axis of [0, 1, 2]) if (corner & (1 << axis)) point.setComponent(axis, point.getComponent(axis) + cube.size[axis]!);
    return point.sub(new THREE.Vector3(...bone.pivot)).multiply(new THREE.Vector3(-1, 1, 1)).applyMatrix4(matrix);
  }));
});

const fixture: DancePose = { ...danceAt(0), hip: [1, -2.5, 0.5], 转: 47, hipTilt: -8,
  leftFoot: [4.2, 0, -0.4], rightFoot: [-4.6, 1.6, 0.5], leftFootDir: [14, 0], rightFootDir: [40, 30] };

const width = 3840, height = 2160;
const naveCamera = makeCamera({ pos: [0.5, -5.6, 2], tgt: [1.1, 0, 0.95], lens: 23 }, width, height);
const shoeShot = (frame: number) => {
  const rig = settlementRig(frame / 60), pose = composeDanceLayers(rig.animation, rig.bonePose);
  const shoes = (side: string) => {
    const vertices = shoeVertices(side, pose).map(point => point.multiplyScalar(scale));
    const bounds = new THREE.Box2().setFromPoints(vertices.map(({ x, y, z }) => {
      const screen = projectToPicture(naveCamera, [-x, -y, z], width, height);
      return new THREE.Vector2(screen.x, screen.y);
    }));
    return { bounds, sole: Math.min(...vertices.map(point => point.z)) };
  };
  const left = shoes('Left'), right = shoes('Right');
  return { pose, left, right, gapX: left.bounds.min.x - right.bounds.max.x, gapY: right.bounds.min.y - left.bounds.max.y };
};

const visiblePastCloth = ({ pose, left }: ReturnType<typeof shoeShot>) => {
  const geometry = GirlYaBoLunCreature.getModel();
  const bones = new Map(geometry.bones.map(bone => [bone.name, bone]));
  const isCloth = (bone: BedrockBone): boolean => ['Skirt', 'pf1', 'pf2', 'pfh1', 'pfh2'].includes(bone.name) || !!bone.parent && isCloth(bones.get(bone.parent)!);
  const root = new THREE.Matrix4().makeRotationX(-Math.PI / 2).multiply(new THREE.Matrix4().makeRotationZ(Math.PI));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometry.bones.flatMap(bone => {
    if (bone.parent !== 'LeftFoot' && !isCloth(bone)) return [];
    const part = boneGeometry(bone, geometry.texW, geometry.texH);
    if (!part) return [];
    const mesh = new THREE.Mesh(part, material);
    mesh.name = bone.parent === 'LeftFoot' ? 'shoe' : 'cloth';
    mesh.matrixWorld.multiplyMatrices(root, skeletonMatrix(model, bone.name, pose, scale));
    return [mesh];
  });
  const caster = new THREE.Raycaster();
  let shoeSamples = 0, visible = 0;
  for (let x = left.bounds.min.x + 2; x < left.bounds.max.x; x += 4) {
    for (let y = left.bounds.min.y + 2; y < left.bounds.max.y; y += 4) {
      caster.setFromCamera(new THREE.Vector2(2 * x / width - 1, 1 - 2 * y / height), naveCamera);
      const hits = caster.intersectObjects(meshes, false);
      if (hits.some(hit => hit.object.name === 'shoe')) shoeSamples++;
      if (hits[0]?.object.name === 'shoe') visible++;
    }
  }
  for (const mesh of meshes) mesh.geometry.dispose();
  material.dispose();
  return visible / shoeSamples;
};

describe('结算舞鞋底到舞台的正解', () => {
  it('最左女孩 F105→112：教堂镜头收腿时左鞋露出袍带，到落脚帧才双脚着地', () => {
    const peak = shoeShot(105 * 2), contact = shoeShot(112 * 2);
    expect(peak.left.sole).toBeGreaterThan(0.25);
    expect(visiblePastCloth(peak)).toBeGreaterThan(0.7);
    for (const frame of [208, 210, 212]) {
      const shot = frame === 210 ? peak : shoeShot(frame);
      expect(shot.right.sole).toBeCloseTo(0, 8);
      expect(shot.gapX).toBeGreaterThan(40);
      expect(shot.gapY).toBeGreaterThan(10);
    }
    expect(shoeShot(223).left.sole).toBeGreaterThan(0);
    expect(contact.left.sole).toBeCloseTo(0, 8);
    expect(contact.right.sole).toBeCloseTo(0, 8);
    expect(contact.gapX).toBeGreaterThan(110);
  });

  it.each(['Left', 'Right'] as const)('%s：支撑、绷脚抬起、交叉落下，鞋底落点不随髋漂移', side => {
    const rest = new THREE.Box3().setFromPoints(shoeVertices(side, {}));
    const soleCenter = rest.getCenter(new THREE.Vector3());
    soleCenter.z = rest.min.z;
    const foot = `${side}Foot`;
    const local = soleCenter.applyMatrix4(skeletonMatrix(model, foot, {}, 1).invert());
    const left = side === 'Left';
    for (const [across, height, forward, pitch] of [[4.2, 0, -0.4, 0], [2.4, 2.6, -1.3, 19], [-1, 1.6, 0.5, 30], [2.4, 2.6, -1.3, -9], [-1, 0, 0.5, 0]]) {
      const target: DancePose['leftFoot'] = [left ? across : -across, height, forward];
      const splay = left ? 22 : 40;
      const pose = scenePose({ ...fixture, [left ? 'leftFoot' : 'rightFoot']: target, [left ? 'leftFootDir' : 'rightFootDir']: [splay, pitch] });
      const matrix = skeletonMatrix(model, foot, pose, 1);
      const center = local.clone().applyMatrix4(matrix);
      center.z = Math.min(...shoeVertices(side, pose).map(vertex => vertex.z));
      const world = center.multiplyScalar(scale).applyMatrix4(placement);
      const expected = new THREE.Vector3(-target[0], forward, height).multiplyScalar(scale).applyMatrix4(placement);
      expect(world.distanceTo(expected), `鞋底 ${target}、绷脚 ${pitch}°`).toBeLessThan(1e-6);
      const toe = new THREE.Vector3(0, 0, -1).transformDirection(matrix);
      const yaw = THREE.MathUtils.degToRad(left ? splay : -splay), tilt = THREE.MathUtils.degToRad(pitch);
      expect(toe.distanceTo(new THREE.Vector3(-Math.sin(yaw) * Math.cos(tilt), Math.cos(yaw) * Math.cos(tilt), -Math.sin(tilt)))).toBeLessThan(1e-6);
    }
  });

  it('超出腿长时沿目标方向伸直，两节实际骨长不变', () => {
    const pose = scenePose({ ...fixture, rightFoot: [-32, 0, 0] });
    const joints = (bones: Record<string, BonePose>) => ['RightLeg', 'RightLowerLeg', 'RightFoot'].map(name => origin(name, bones));
    const [hip, knee, ankle] = joints(pose), [restHip, restKnee, restAnkle] = joints({});
    expect(hip.distanceTo(knee)).toBeCloseTo(restHip.distanceTo(restKnee), 8);
    expect(knee.distanceTo(ankle)).toBeCloseTo(restKnee.distanceTo(restAnkle), 8);
    expect(hip.distanceTo(ankle)).toBeCloseTo(restHip.distanceTo(restKnee) + restKnee.distanceTo(restAnkle), 7);
    expect(ankle.x).toBeGreaterThan(knee.x);
  });

  it('846 帧中两只鞋的真实最低点都跟随舞谱，包括宽站换重心后的落脚', () => {
    for (let frame = 0; frame < 846; frame++) {
      const target = danceAt(frame / 60);
      const pose = scenePose(target);
      for (const side of ['Left', 'Right'] as const) {
        const minimum = Math.min(...shoeVertices(side, pose).map(vertex => vertex.z));
        expect(minimum, `${side} 第 ${frame} 帧`).toBeCloseTo((side === 'Left' ? target.leftFoot : target.rightFoot)[1], 5);
      }
    }
  });
});
