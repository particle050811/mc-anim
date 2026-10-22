// 6-4-2 规矩：放大 4 倍的新城（古城4x画布，10-13）里，李樱跳切到兵营南门外（Q4），一小跳进城西头兵营，落在 #210 跟前开箱惹出第一次尖啸，定住不动，等黑暗效果过去接着翻箱子。
// 编排见 编排.ts，声音见 声音.tsx。首帧接 6-4-1（中间四跳不演），末帧的下一帧是 6-4-3a 首帧（../古城4x布局.ts 的 六四二末帧），两段合成 6-4-2至3a（../6-4-2至3a/）。跳切（编排.ts）的成片帧用 剧情帧() 换。
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { FOG_4X } from '../../../地点/古城4x.tsx';
import { G4 } from '../../../地点/古城4x.tsx';
import { SculkSensor } from '@库/特效/幽匿感测体.tsx';
import { VibrationSignal } from '@库/特效/振动粒子.tsx';
import { ShriekRings } from '@库/特效/尖啸声波.tsx';
import { DarknessEffect } from '@库/特效/黑暗效果.tsx';
import { AncientCity4xCanvas, LiYingWithBlade, type Cam } from '../../../地点/古城4x/6-4-1/古城画面.tsx';
import * as choreo from './编排.ts';
import { RulesSound } from './声音.tsx';

export const rulesFrames = choreo.END;

// 网格里画死的感测体藏掉、换成会抖的（同老 6-4-2：底座侧面和顶面、触须分两个盒子藏）
export const HIDE: number[][] = choreo.sensors.flatMap(([x, y, z]) => {
  const lo = G4(x, y, z + 1);
  const hi = G4(x + 1, y + 1, z);
  return [
    [lo[0] - 0.005, lo[1] - 0.005, lo[2] + 0.1, hi[0] + 0.005, hi[1] + 0.005, lo[2] + 0.4],
    [lo[0] + 0.01, lo[1] + 0.01, lo[2] + 0.4, hi[0] - 0.01, hi[1] - 0.01, hi[2] - 0.001],
  ];
});
const blockBottomCenter = ([x, y, z]: number[]) => G4(x + 0.5, y, z + 0.5);

// f 是剧情帧（编排.ts 的时间轴，不跳），可以带小数（核对用）；cam 不给就是这一帧镜头的机位
export const RulesView: React.FC<{ f: number; cam?: Cam }> = ({ f: storyFrame, cam }) => {
  const { width, height } = useVideoConfig();
  const woolState = choreo.wool(storyFrame);
  const t = storyFrame / choreo.FPS;
  const tendrilClock = choreo.sensorClock(storyFrame);
  return (
    <AncientCity4xCanvas 段="6-4-2" cam={cam ?? choreo.camera(storyFrame)} width={width} height={height} hide={HIDE} 羊毛={woolState.羊毛} growingWool={woolState.长羊毛} 开箱={choreo.openChest(storyFrame)}>
      <LiYingWithBlade pose={choreo.liying(storyFrame)} />
      {choreo.sensors.map((b, i) => (
        <SculkSensor key={i} p={blockBottomCenter(b)} 秒={tendrilClock} 激活秒={t - choreo.activateSecs[i]} seed={i + 1} />
      ))}
      {choreo.vibrations.map((v, i) => (
        <VibrationSignal key={i} from={v.from} to={v.to} sec={t - v.t} 帧={i * 3} />
      ))}
      <ShriekRings p={choreo.shriek.p} sec={t - choreo.shriek.t} />
      {/* 黑暗效果：雾和亮度照 1.20.1（模型/特效/黑暗效果.tsx），平时的雾是古城4x画布的 FOG_4X */}
      <DarknessEffect sec={t - choreo.darknessStartSec} fogColor={FOG_4X.color} normalFogNear={FOG_4X.near} normalFogFar={FOG_4X.far} fogBackground />
    </AncientCity4xCanvas>
  );
};

export const Rules: React.FC = () => {
  const cutFrame = useCurrentFrame();
  return (
    <>
      <RulesView f={choreo.toStoryFrame(cutFrame)} />
      <RulesSound />
    </>
  );
};
