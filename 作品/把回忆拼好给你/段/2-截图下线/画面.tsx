// 2-截图下线 的画面：场/2-门口/门口之夜照片.tsx 按歌曲帧画（定格前就是门口之夜画布），外面包夜的整片后期（颗粒种子 = 歌曲帧，定格前牌面上不盖颗粒），符文歌词在顶上、一起过后期。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { segClock } from '../../分镜/正片第9至11句.ts';
import { palette } from '../../色板.ts';
import { RuneLyric, runeLyricDefault } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { signFaceRects, freezeFrame } from '../../场/2-门口/门口之夜参数.ts';
import { DoorwayNightPhoto } from '../../场/2-门口/门口之夜照片.tsx';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { useCurrentFrame } from '../../当前帧.ts';

const startFrame = segClock('2-截图下线').起帧;
const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, startFrame));
const lyricStyle = { ...runeLyricDefault, outlineColor: palette.夜.outlineColor };

/** 前帧 取上一帧：屋后远景按它算画布高，学的是顺序渲染「读上一帧的高度」（docs/渲染性能.md 的 E）。原来取 1/24 秒以前，用户 11-03「统统改成 60 帧」 */
const picture: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <FilmPost grade={palette.夜.grade} 种子={startFrame + f} grainYield={startFrame + f < freezeFrame ? signFaceRects(startFrame + f) : undefined}>
        <DoorwayNightPhoto 帧={startFrame + f} prevFrame={f >= 1 ? startFrame + f - 1 : undefined} />
        <RuneLyric lines={lyricLines} 样式={lyricStyle} />
      </FilmPost>
    </AbsoluteFill>
  );
};

export default definePicture(seg, soundUrl, picture);
