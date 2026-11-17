// 日落划船核对的画面：按视图表一帧画一个视图，整页就是成片那一帧（不写视图名）；颗粒的种子是那一帧歌曲帧（场/2-海上/海上.tsx 里给的）。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { crossfadeStyle, waveStyle } from '../../场/2-海上/参数.ts';
import { eyeCameraRig } from '../../场/2-海上/编排.ts';
import { SunsetRowingPicture } from '../../场/2-海上/海上.tsx';
import { AltarPicture } from '../../场/2-祭坛/祭坛.tsx';
import { views } from './视图.ts';
import { useCheckView } from '@engine/段/核对画面.tsx';

/** 眼睛特写同段里（第 3 句祭坛那一镜接着推） */
const eyeView = (g: number) => <AltarPicture g={g} machine={eyeCameraRig(g)} />;

const picture: React.FC = () => {
  const v = useCheckView(views);
  return (
    <AbsoluteFill style={{ background: '#000000' }}>
      <SunsetRowingPicture songFrame={v.frame} eyeView={eyeView} waveOn={v.waveOn ?? true} withPost={v.withPost ?? true} crossfadeStyle={crossfadeStyle} waveStyle={waveStyle} />
    </AbsoluteFill>
  );
};

export default picture;
