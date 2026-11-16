// 正片 15 尾（52.94–54.65），隐世之境：从 2-重逢 你的视角硬切到侧面合照，她靠到你肩上，咔哒那一帧切到片尾。画法在 场/2-隐世之境/合照.tsx（按歌曲帧画）。
// 2-重逢 的台词气泡跟着硬切接过来、她靠好那一帧收（合照画面 自己画，用户 10-25 要气泡多留一会儿）。
// 歌词：15 句都交给符文歌词（这一段里只剩第 15 句「爱炙热的你却忘了爱自己」），样式同 2-重逢（底部），硬切那一下歌词不跳；咔哒那一帧起退场（退在片尾的闪白里）。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { segClock, segEventFrames as segMainCutEventFrames } from '../../分镜/正片15尾.ts';
import { palette } from '../../色板.ts';
import { RuneLyric } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { line15RuneStyle } from '../../场/2-门口/归隐歌词.ts';
import { GroupPhotoPicture } from '../../场/2-隐世之境/合照.tsx';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { useSnappedFrame } from '../../当前帧.ts';

const segKey = '2-合照';
const startFrame = segClock(segKey).起帧;
const eventFrames = segMainCutEventFrames(segKey);
const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, startFrame));
const lyricStyle = { ...line15RuneStyle, outlineColor: palette['归隐之地'].outlineColor };

const picture: React.FC = () => {
  const f = useSnappedFrame();
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <GroupPhotoPicture frame={startFrame + f} overlay={<RuneLyric lines={lyricLines} 样式={lyricStyle} 收={eventFrames.groupPhotoClick} />} />
    </AbsoluteFill>
  );
};

export default definePicture(seg, soundUrl, picture);
