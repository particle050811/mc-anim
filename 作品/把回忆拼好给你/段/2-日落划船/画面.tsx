// 2-日落划船 的画面：整帧照 场/2-海上/海上.tsx 画（眼睛特写 → 叠化 → 日落的海 → 浪），歌词浮在最上面、不过后期。
// 眼睛特写就是第 3 句祭坛那一镜接着推：场/2-祭坛 的 祭坛画面（同一个场景、同一片天，她停在 末态.ts 那样），镜头换成 场/2-海上 的 眼机位，接缝上不跳。
// 歌词把 15 句都交给符文歌词（它自己按时刻挑出这一段里看得见的：第 3 句的退场、第 4 句、第 5 句的进场），描边色跟着当下的镜头走。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { shadingScope } from '@engine/三渲二/画布.tsx';
import { palette } from '../../色板.ts';
import { RuneLyric } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { runeLyricDefault } from '../../界面/符文排版.ts';
import { shadingBySeg } from '../../默认.ts';
import { crossfadeStyle, waveStyle, seaToneName, eyeToneName } from '../../场/2-海上/参数.ts';
import { crossfade, toSongFrame, eyeCameraRig, segWindow } from '../../场/2-海上/编排.ts';
import { SunsetRowingPicture } from '../../场/2-海上/海上.tsx';
import { AltarPicture } from '../../场/2-祭坛/祭坛.tsx';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { useSnappedFrame } from '../../当前帧.ts';

const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, segWindow.起帧));
// 眼睛特写是 2-祭坛召唤 那一镜接着推，光影跟它走（接缝上不跳）；海那块照本段的（海上.tsx）
const eyeView = (g: number) => (
  <shadingScope.Provider value={{ shading: shadingBySeg['2-祭坛召唤'] }}>
    <AltarPicture g={g} 机={eyeCameraRig(g)} />
  </shadingScope.Provider>
);

const picture: React.FC = () => {
  const f = useSnappedFrame();
  const g = toSongFrame(f);
  // 叠化过半就换成海那套的描边色
  const outlineColor = palette[crossfade(g) < 0.5 ? eyeToneName : seaToneName].outlineColor;
  return (
    <AbsoluteFill>
      <SunsetRowingPicture songFrame={g} eyeView={eyeView} crossfadeStyle={crossfadeStyle} waveStyle={waveStyle} />
      <RuneLyric lines={lyricLines} 样式={{ ...runeLyricDefault, outlineColor }} />
    </AbsoluteFill>
  );
};

export default definePicture(seg, soundUrl, picture);
