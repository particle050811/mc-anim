// 6-4-1 羊毛搜刮：放大 4 倍的新城（古城4x画布，10-13）里，李樱从 6-3-6 的落点起一跳二十多米、落脚处垫羊毛，三镜跳切：大院 → 场子垫 F1 → 开 #212、跳走。
// 戏在 跳搭.ts（剧情时间线），跳切和机位在 编排.ts；声音照本段 段.ts 的 cue 放（definePicture 自动挂），不再挂 6-4-1/声音.tsx。
import React from 'react';
import { useVideoConfig } from 'remotion';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { bladeInHand } from '@库/角色/骨架.tsx';
import { MaceInHand } from '@库/物品/重锤.tsx';
import { AncientCity4xCanvas, LiYingWithBlade } from '../../地点/古城4x/6-4-1/古城画面.tsx';
import * as choreo from '../../场/6-古城/6-4-1/编排.ts';
import * as jumpBuild from '../../场/6-古城/6-4-1/跳搭.ts';
// 剧情秒 t、成片秒 cutSec 的画面（核对静帧也用）
export const WoolSearchView: React.FC<{ t: number; cutSec: number }> = ({ t, cutSec }) => {
  const { width, height } = useVideoConfig();
  const wool = jumpBuild.woolStateAt(t);
  const pose = jumpBuild.poseAt(t);
  return (
    <AncientCity4xCanvas segment="6-4-1" cam={choreo.camera(cutSec)} width={width} height={height} wool={wool.wool} growingWool={wool.growingWool} chestOpening={choreo.openChest(t)}>
      {jumpBuild.hasHammer(t) ? (
        // 6-3-6 末帧：右手还握着重锤（刀鞘照常挂在腰上）
        <LiYingWithBlade
          pose={pose}
          handR={
            <group quaternion={bladeInHand(pose, jumpBuild.hammerAngle)}>
              <MaceInHand />
            </group>
          }
        />
      ) : (
        <LiYingWithBlade pose={pose} />
      )}
    </AncientCity4xCanvas>
  );
};

export const WoolSearch: React.FC = () => {
  const cutSec = useCurrentSec();
  return <WoolSearchView t={choreo.storySec(cutSec)} cutSec={cutSec} />;
};
