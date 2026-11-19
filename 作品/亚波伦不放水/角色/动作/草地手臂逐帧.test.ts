import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import { GirlYaBoLunCreature } from '../娘化亚波伦.tsx';
import { composeDanceLayers, settlementRig } from '../结算舞姿势.ts';
import { grassArmFrames } from './草地手臂逐帧.ts';

const model = GirlYaBoLunCreature.getModel();
const armShape = (sourceFrame: number, side: 'Left' | 'Right') => {
  const rig = settlementRig(sourceFrame / 30);
  const pose = composeDanceLayers(rig.animation, rig.bonePose);
  const shoulder = skeletonMatrix(model, `${side}Arm`, pose, 1);
  const elbow = skeletonMatrix(model, `${side}ForeArm`, pose, 1);
  const palm = new THREE.Vector3(-0.08041, -5.64123, 0.5).applyMatrix4(elbow);
  const upper = new THREE.Vector3().setFromMatrixPosition(elbow).sub(new THREE.Vector3().setFromMatrixPosition(shoulder));
  const lower = palm.clone().sub(new THREE.Vector3().setFromMatrixPosition(elbow));
  const angle = (vector: THREE.Vector3) => THREE.MathUtils.radToDeg(Math.atan2(-vector.x, -vector.z));
  return { palm, reach: upper.length() + lower.length(), direction: angle(upper), bend: Math.abs(THREE.MathUtils.euclideanModulo(angle(upper) - angle(lower) + 180, 360) - 180) };
};

describe('真人原帧对照：上臂到袖外掌心的正面投影', () => {
  it('423 帧双侧数据完整，不把看不到的手腕当作跨段插值', () => {
    expect(grassArmFrames).toHaveLength(423);
    expect(grassArmFrames.every(row => row.length === 8 && row.every(Number.isFinite))).toBe(true);
    for (const frame of [0, 1, 2, 3, 4]) {
      expect(armShape(frame, 'Right').direction).toBeLessThan(-110);
      expect(armShape(frame, 'Right').bend).toBeLessThan(8);
    }
    for (const frame of [0, 1, 2, 3]) expect(armShape(frame, 'Left').bend).toBeLessThan(8);
    expect(armShape(4, 'Left').bend).toBeGreaterThan(armShape(3, 'Left').bend);
    expect(armShape(7, 'Right').bend).toBeGreaterThan(70);
    expect(armShape(17, 'Left').direction).toBeGreaterThan(120);
  });
  it('中段反复前送再收肘，不把三次前送渲成交臂', () => {
    for (const side of ['Left', 'Right'] as const) {
      for (const frame of [226, 259, 283]) expect(armShape(frame, side).bend).toBeLessThan(20);
      for (const frame of [241, 268, 296]) expect(armShape(frame, side).bend).toBeGreaterThan(95);
    }
  });
  it('31 秒收肘展开：袖外掌心逐个成片帧走弧，不从胸前跳到体侧', () => {
    for (const side of ['Left', 'Right'] as const) {
      const path = Array.from({ length: 77 }, (_, index) => armShape((232 + index) / 2, side));
      for (const [index, current] of path.entries()) {
        if (index > 0) expect(current.palm.distanceTo(path[index - 1]!.palm) / current.reach).toBeLessThan(0.18);
        if (index > 1) {
          const acceleration = path[index - 2]!.palm.clone().add(current.palm).addScaledVector(path[index - 1]!.palm, -2);
          expect(acceleration.length() / current.reach).toBeLessThan(0.10);
        }
      }
    }
    expect(armShape(144, 'Left').bend).toBeGreaterThan(125);
    expect(armShape(150, 'Left').bend).toBeLessThan(38);
  });
});
