// 6-3-1 又回到边城的声音：三句台词 + 飞行配乐的尾巴。
// - 台词（src/配音/）：李樱「诶，我们怎么又回到这里了？」在 `cues631.李樱台词` 开口；九胡「狗修金要找的古城，就在这座边城的脚下。」在 `cues631.九胡台词` 开口；
//   九胡「狗修金打算怎么下去呢？」开口在 `jiuhuAskFrame`（段内第 198 帧，用户在剪映里放的位置），编排留到 10.95 秒（段长 11 秒）。
// - 配乐：飞行那首 Wasted 的后一半从 6-2-5 放到 6-2-6 末帧，这里接着放尾巴，直接用 6-2-5 的 飞行配乐（同组件、同渐弱曲线），起帧 = 6-2-6 末帧在飞行时间线上的全局帧；
//   歌曲时间、渐弱从 6-2-5/编排.ts 的 段表、卡.停住 算：渐弱从悬停那刻起三小节，到第 169 帧淡到无声。不用 第六章飞行.ts 里的旧 淡出 [46,1]→[49,1]（旧卡点比现在的悬停早 4 秒，会一下跳）。
// - 九胡把手里的指南针拿到身前、收回：没有声音，不加；高空没有风声；女仆模组的扫帚悬停、飞行都没有声音。
import React from 'react';
import { LineTrack } from '../../../../world/配音/台词轨.tsx';
import { FlightMusic } from '../../../../world/地点/边城/6-2-5/飞越主世界.tsx';
import { segmentTable as 飞行段表 } from '../../../../world/地点/边城/6-2-5/编排.ts';
import { lines } from '../../../场/6-边城/6-3-1/编排.ts';

// 各句开口帧（工具/合成第六章 的台词落点、同步表从这里取）
export const [liYingLineFrame, jiuhuLineFrame, jiuhuAskLineFrame] = lines.map((line) => line.帧);
// 6-3-1 第 0 帧在飞行时间线上的全局帧
export const musicStartFrame = 飞行段表['6-2-6'].止;

export const BackToTownSound: React.FC = () => (
  <>
    <FlightMusic startFrame={musicStartFrame} />
    <LineTrack 句们={lines} />
  </>
);
