import { Quaternion, Vector3, MathUtils } from 'three';
import { expect, it } from 'vitest';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import { GirlYaBoLunCreature } from '../娘化亚波伦.tsx';
import { composeDanceLayers, settlementRig } from '../结算舞姿势.ts';
import { danceFormat } from './Blender舞轨.ts';
import { danceAt } from './忘情牛肉面.ts';

it('846 帧的袖外掌心跟随舞谱方向，不在抬臂过顶时另翻半圈袖口', () => {
  const model = GirlYaBoLunCreature.getModel();
  const previous = new Map<string, { orientation: Quaternion; direction: Vector3 }>();
  for (let frame = 0; frame < danceFormat.frameCount; frame++) {
    const sec = frame / danceFormat.fps;
    const rig = settlementRig(sec), pose = composeDanceLayers(rig.animation, rig.bonePose);
    const input = danceAt(sec), torso = skeletonMatrix(model, 'UpBody', pose, 1);
    for (const side of ['Left', 'Right'] as const) {
      const matrix = skeletonMatrix(model, `${side}ForeArm`, pose, 1);
      const orientation = new Quaternion().setFromRotationMatrix(matrix).normalize();
      const direction = new Vector3(-0.08041, -5.64123, 0.5).transformDirection(matrix);
      const [across, up, forward] = side === 'Left' ? input.leftForeArm : input.rightForeArm;
      expect(direction.distanceTo(new Vector3(-across, up, -forward).transformDirection(torso)), `${side} 掌向 @${frame}`).toBeLessThan(1e-7);
      const last = previous.get(side);
      if (last) {
        const excess = orientation.angleTo(last.orientation) - direction.angleTo(last.direction);
        expect(MathUtils.radToDeg(excess), `${side} 多余转角 ${frame - 1}→${frame}`).toBeLessThan(15);
      }
      previous.set(side, { orientation, direction });
    }
  }
});
