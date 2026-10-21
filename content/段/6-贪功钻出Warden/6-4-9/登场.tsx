// 6-4-9 Warden 的画面：接 6-4-8 末帧，监守者的大口、心脏、触角三个短特写，中间插二人横挪逼近，监守者起吼、吼声出来切全景。编排见 编排.ts，声音见 声音.tsx。
// 场景、人物、监守者全是 6-4-8 现成的（古城网格、追兵.tsx、模型/角色/监守者.tsx），没有新做的模型和特效。
// 全景不叠「WARDEN 监守者」登场大字（用户 10-12 说不必介绍）。成片段是 ../6-4-7至9/。
import React from 'react';
import { useVideoConfig } from 'remotion';
import { rad } from '../../../../engine/anim/anim.ts';
import { Warden } from '../../../../world/生物/监守者.tsx';
import { HuangPan, LiuXinzhong } from '../../../../world/角色/追兵.tsx';
import { AncientCity4xCanvas } from '../../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import * as K648 from '../../../../world/地点/古城4x/6-4-8/编排.ts';
import * as choreo from '../../../../world/地点/古城4x/6-4-9/编排.ts';

// f：本段帧（6-4-7至9 的后一截，见 ../6-4-7至9/）
export const RevealView: React.FC<{ f: number }> = ({ f: frame }) => {
  const { width, height } = useVideoConfig();
  const pursuerPoses = choreo.pursuers(frame);
  return (
    <AncientCity4xCanvas 段="6-4-9" cam={choreo.camera(frame)} width={width} height={height} 羊毛={K648.woolNames}>
      <group position={choreo.WARDEN_AT} rotation={[0, 0, rad(choreo.WARDEN_YAW)]}>
        <Warden {...choreo.warden(frame)} />
      </group>
      <LiuXinzhong pose={pursuerPoses.刘} />
      <HuangPan pose={pursuerPoses.黄} 弓={choreo.bowAt(frame)} />
    </AncientCity4xCanvas>
  );
};
