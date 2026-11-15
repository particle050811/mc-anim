// 正片第 14 句末到第 15 句开头（合屏到位 48.26 – 风散开 49.75），门这个机位：你上线、摇铃、樱花风盖满画面。画法在 场/2-门口/摇铃.tsx（按歌曲帧画），
//   这里接上段的钟、声音和歌词。
// 歌词两套同 2-归隐（场/2-门口/归隐歌词.ts，歌上同一帧画出来一样，接缝接得上）：顶上第 14 句「也为你骗自己放下」亮到你上线前退完，
//   第 15 句「爱炙热的你却忘了爱自己」在底部，等聊天行淡掉才进（下一段 2-重逢 里）；描边色取这一帧的调子。用户 10-24「还在用素字歌词的段换成符文歌词」。叠在整片后期里面。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { segClock } from '../../分镜/正片第15句.ts';
import { RuneLyric, runeLyricDefault } from '../../界面/符文歌词.tsx';
import { retreatLyrics, line15RuneStyle } from '../../场/2-门口/归隐歌词.ts';
import { ShakeBellPicture, bellShakeTone } from '../../场/2-门口/摇铃.tsx';
import { shadingBySeg } from '../../默认.ts';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { useSnappedFrame } from '../../当前帧.ts';

const startFrame = segClock('2-摇铃').起帧;
const lyrics = retreatLyrics(startFrame);

const picture: React.FC = () => {
  const f = useSnappedFrame();
  const frame = startFrame + f;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <ShakeBellPicture
        帧={frame}
        种子={f}
        shading={shadingBySeg['2-摇铃']}
        叠层={
          <>
            <RuneLyric lines={lyrics.upperLines} 样式={{ ...runeLyricDefault, outlineColor: bellShakeTone(frame).outlineColor }} />
            <RuneLyric lines={lyrics.lowerLines} 样式={{ ...line15RuneStyle, outlineColor: bellShakeTone(frame).outlineColor }} />
          </>
        }
      />
    </AbsoluteFill>
  );
};

export default definePicture(seg, soundUrl, picture);
