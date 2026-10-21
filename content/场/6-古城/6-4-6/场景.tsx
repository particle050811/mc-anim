// 6-4-6、6-4-7 的古城4x 画面：古城4x画布（块按段）、李樱一路垫的羊毛（按他绕行的时刻，场子里贴北墙根的 F1 就在画里）、
// 远处绕向屋顶 V 的李樱、振动链（追兵.ts 算的：振动粒子、会抖的感测体、尖啸体的声波环）和二人。
// 6-4-3 留下的东西（击穿的洞顶、落石、钉住的箭）都在 200 米外的兵营，不画。
// 战利品箱：李樱开过的 #212、#210 画已开贴图（用户 10-20：开过的箱子之后都是开过的样子，不管镜头站在谁那边；见 ../古城4x布局/箱子.ts）。
import React from 'react';
import { useVideoConfig } from 'remotion';
import { HuangPan, LiuXinzhong } from '../../../../world/角色/追兵.tsx';
import type { FigurePose } from '../../../../world/角色/骨架.tsx';
import { SculkSensor } from '../../../../world/特效/幽匿感测体.tsx';
import { VibrationSignal } from '../../../../world/特效/振动粒子.tsx';
import { ShriekRings } from '../../../../world/特效/尖啸声波.tsx';
import { AncientCity4xCanvas, LiYingWithBlade, type Cam } from '../../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import * as K645 from '../6-4-5/编排.ts';
import { chain } from './追兵.ts';
import { sensorBaseCenter, sensorCells, sensorHideBoxes, cellKey } from './振动链.ts';

// 收到过振动的感测体：网格里画死的藏掉，换成会抖的（一次建好，BlockMesh 按数组引用判断要不要重建）
const shakingSensors = sensorCells.filter((b) => chain.激活.has(cellKey(b)));
const hideBoxes = sensorHideBoxes(shakingSensors);

// τ：追兵钟（秒，6-4-5 第 0 帧起）；段：6-4-6 还是 6-4-7（开过哪些箱子按它算）
export const PursuerScene: React.FC<{ 段: '6-4-6' | '6-4-7'; τ: number; cam: Cam; liu: FigurePose; huang: FigurePose }> = ({ 段: segment, τ, cam, liu: liu, huang: huang }) => {
  const { width, height } = useVideoConfig();
  const wool = K645.woolAt(τ);
  return (
    <AncientCity4xCanvas 段={segment} cam={cam} width={width} height={height} hide={hideBoxes} 羊毛={wool.羊毛} growingWool={wool.growingWool}>
      <LiYingWithBlade pose={K645.detourPose(τ)} />
      <LiuXinzhong pose={liu} />
      <HuangPan pose={huang} />
      {shakingSensors.map((b, i) => (
        <SculkSensor key={i} p={sensorBaseCenter(b)} 秒={τ} 激活秒={τ - chain.激活.get(cellKey(b))!} seed={i + 1} />
      ))}
      {chain.vibrations.map((v, i) => (
        <VibrationSignal key={i} from={v.from} to={v.to} sec={τ - v.t} 帧={i * 3} />
      ))}
      {chain.尖啸们.map((s, i) => (
        <ShriekRings key={i} p={s.p} sec={τ - s.t} />
      ))}
    </AncientCity4xCanvas>
  );
};
