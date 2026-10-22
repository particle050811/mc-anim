// 6-4-8 钻出的画面：场子（古城4x）里，监守者照原版钻出动画（快放到 1.75 秒）从二人面前的地里爬出来。编排见 编排.ts；成片段是 ../6-4-7至9/。
import React from 'react';
import { useVideoConfig } from 'remotion';
import { rad } from '@engine/anim/anim.ts';
import { Warden } from '@库/生物/监守者.tsx';
import { HuangPan, LiuXinzhong } from '../../../角色/追兵.tsx';
import { BlockCrumbs } from '@库/特效/方块碎屑.tsx';
import { ShriekRings } from '@库/特效/尖啸声波.tsx';
import { AncientCity4xCanvas } from '../../../地点/古城4x/6-4-1/古城画面.tsx';
import * as choreo from '../../../地点/古城4x/6-4-8/编排.ts';

// f：本段帧（6-4-7至9 的中间一截，见 ../6-4-7至9/）
export const EmergeView: React.FC<{ f: number }> = ({ f: frame }) => {
  const { width, height } = useVideoConfig();
  const wardenProps = choreo.warden(frame);
  const pursuerPoses = choreo.pursuers(frame);
  const t = choreo.emergeSec(frame);
  return (
    <AncientCity4xCanvas 段="6-4-8" cam={choreo.camera(frame)} width={width} height={height} 羊毛={choreo.woolNames}>
      <group position={choreo.WARDEN_AT} rotation={[0, 0, rad(choreo.WARDEN_YAW)]}>
        <Warden {...wardenProps} />
      </group>
      {/* 碎屑：跟着钻出动画快放，只撒 碎屑秒（1.18 秒），每刻 15 个（见 编排.ts 文件头） */}
      {t >= 0 && <BlockCrumbs center={choreo.WARDEN_AT} sec={t} perTick={15} durationSec={choreo.crumbSec} seed={3} />}
      <ShriekRings p={choreo.SHRIEKER} sec={choreo.shriekSec(frame)} />
      <LiuXinzhong pose={pursuerPoses.刘} />
      {/* 拉弓：急退落地以后搭箭拉满，弓的贴图照原版三档换（编排.ts 的 bowAt） */}
      <HuangPan pose={pursuerPoses.黄} 弓={choreo.bowAt(frame)} />
    </AncientCity4xCanvas>
  );
};
