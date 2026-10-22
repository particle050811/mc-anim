// 6-1-9b 落地后的声音：
// - 配乐：飞行配乐前一半，接着 6-1-9 一路放（编排.ts 的 `musicStartSec`）；[29, 1] 进 breakdown，[31, 1] 两小节渐弱到无声，增益照 第六章飞行 的前一半；
// - 落地：两人着地的摔落声（落地编排.ts 的 `landingSounds`）；
// - 台词：九胡「呐呐，狗修金Sama，为什么这里什么也没有啊？」、李樱「都穿越到mc了，没想到暮色森林还是没有最终boss！」，开口在 编排.ts 的 `lineTimes`。
// 站起来以后没有音效：两人站着、转头、探身都没有声音；九胡只往前凑小半步，不到一步
// （Entity.move 每走 1 / 0.6 格才响一声脚步，同 6-2-1/声音.tsx 的口径），不响。扫帚飞行在车万女仆里没有声音，也没有风声（同 一镜到底/声音.tsx）。
import React from 'react';
import { MusicAudio } from '../../配乐/配乐音轨.tsx';
import { halfGain, ch6FlightMusic } from '../../配乐/第六章飞行.ts';
import { GameSoundTrack } from '@engine/audio/游戏音效.tsx';
import { LineTrack } from '../../配音/台词轨.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import * as choreo from '../../场/6-暮色森林/6-1-9b/编排.ts';
import { landingSounds } from '../../场/6-暮色森林/6-1-9b/落地编排.ts';

export const AfterLandingSound: React.FC = () => (
  <>
    <MusicAudio song={ch6FlightMusic.song} startSec={choreo.musicStartSec} gain={(t) => halfGain(ch6FlightMusic, '前一半', t)} />
    <GameSoundTrack sounds={landingSounds} listener={(f) => choreo.camPose(f).pos as V3} />
    <LineTrack 句们={choreo.lineCues} />
  </>
);
