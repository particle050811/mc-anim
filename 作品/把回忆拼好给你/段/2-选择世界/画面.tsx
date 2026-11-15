// 2-选择世界 的画面：原版「选择世界」界面（场/2-选择世界），取景定在「新的世界」那一项上不动；光标、指着、选中、搜索框光标照 编排.ts 按歌曲帧走。
// 整片后期用现实的调子（冷、灰一点：高考后坐在电脑前），歌词浮在最上面、一起过后期（同 核对/歌词艺术字小样）。
import type React from 'react';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { segmentWindow } from '../../分镜/正片开场.ts';
import { palette } from '../../色板.ts';
import { RuneLyric, runeLyricDefault } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { SelectWorld } from '../../场/2-选择世界/选择世界.tsx';
import { cursorAt, normalFraming, pointingAt, boxCursorOn, isSelectedAt } from '../../场/2-选择世界/编排.ts';
import { oldIcon } from '../../场/2-选择世界/图标源.ts';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { use当前帧 } from '../../当前帧.ts';

const startFrame = segmentWindow('2-选择世界').起帧;
const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, startFrame));
const tone = palette.现实;

const picture: React.FC = () => {
  const songFrame = startFrame + use当前帧();
  return (
    <>
      <FilmPost grade={tone.grade} 种子={songFrame}>
        <SelectWorld
          状态={{ framing: normalFraming, pointAt: pointingAt(songFrame), selected: isSelectedAt(songFrame), frameCursor: boxCursorOn(songFrame, startFrame), cursor: cursorAt(songFrame), iconMap: oldIcon }}
        />
        <RuneLyric lines={lyricLines} 样式={{ ...runeLyricDefault, outlineColor: tone.outlineColor }} />
      </FilmPost>
    </>
  );
};

export default definePicture(seg, soundUrl, picture);
