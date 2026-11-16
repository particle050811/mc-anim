// 2-时差 的画面：第 f 帧画歌曲帧 起帧 + f 的分屏（场/2-门口/时差分屏.tsx），开头两屏从右边滑进来（接入）。
// 符文歌词（全片 15 行，按歌自己进出）叠在两屏和分屏线上面、整页那层质感里面：不跟哪一屏调色（两屏一冷一暖），描边色取服务器那半的调子。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { lerpTone } from '@engine/三渲二/调子.ts';
import { segClock } from '../../分镜/正片第13至14句.ts';
import { SplitState } from '../../场/2-门口/分屏参数.ts';
import { TimeLagSplit } from '../../场/2-门口/时差分屏.tsx';
import { palette } from '../../色板.ts';
import { RuneLyric, runeLyricDefault } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { shadingBySeg } from '../../默认.ts';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { useSnappedFrame } from '../../当前帧.ts';

const startFrame = segClock('2-时差').起帧;
const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, startFrame));

const picture: React.FC = () => {
  const f = useSnappedFrame();
  const frame = startFrame + f;
  // 同 时差分屏.tsx 的 服务器调子
  const outlineColor = lerpTone(palette.夏日白天, palette.褪色, SplitState(frame).fade).outlineColor;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <TimeLagSplit frame={frame} joining seed={frame} shading={shadingBySeg['2-时差']} realShading={shadingBySeg['2-时差/现实']} overlay={<RuneLyric lines={lyricLines} 样式={{ ...runeLyricDefault, outlineColor }} />} />
    </AbsoluteFill>
  );
};

export default definePicture(seg, soundUrl, picture);
