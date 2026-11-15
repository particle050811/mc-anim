// 2-归隐 的画面：第 f 帧画歌曲帧 起帧 + f（场/2-门口/归隐.tsx：分屏 → 她传送走 → 同一个镜头拉开、分屏线推出画面，纸留下来和花瓣一起飘）。
// 符文歌词同 2-时差：叠在两屏上面、整页那层质感里面，描边色取服务器那半的调子；第 15 句放到底部（场/2-门口/归隐歌词.ts）。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { segClock } from '../../分镜/正片第13至14句.ts';
import { leftToneAt, RetreatPicture } from '../../场/2-门口/归隐.tsx';
import { retreatLyrics, line15RuneStyle } from '../../场/2-门口/归隐歌词.ts';
import { RuneLyric, runeLyricDefault } from '../../界面/符文歌词.tsx';
import { shadingBySeg } from '../../默认.ts';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { useSnappedFrame } from '../../当前帧.ts';

const startFrame = segClock('2-归隐').起帧;
const lyrics = retreatLyrics(startFrame);

const picture: React.FC = () => {
  const f = useSnappedFrame();
  const frame = startFrame + f;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <RetreatPicture
        帧={frame}
        种子={frame}
        shading={shadingBySeg['2-归隐']}
        realShading={shadingBySeg['2-归隐/现实']}
        叠层={
          <>
            <RuneLyric lines={lyrics.upperLines} 样式={{ ...runeLyricDefault, outlineColor: leftToneAt(frame).outlineColor }} />
            <RuneLyric lines={lyrics.lowerLines} 样式={{ ...line15RuneStyle, outlineColor: leftToneAt(frame).outlineColor }} />
          </>
        }
      />
    </AbsoluteFill>
  );
};

export default definePicture(seg, soundUrl, picture);
