// 歌词艺术字小样的画面：门口那一帧（定住，同 核对-歌词艺术字 的门口底：核对-门口哈气 的定稿帧；核对之间不互引，照抄四行）+ 全片 15 句符文歌词（和段一样传 15 句，窗口里看得到的是第 7、8、9 句；定稿样式、第 8 句调子的描边），一起包在整片后期里（颗粒种子 = 歌曲帧，同片子）。
import type React from 'react';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { PuffCharacter, PuffBubble } from '../../场/2-门口/哈气.tsx';
import { fullScreenShot } from '../../场/2-门口/参数.ts';
import { DoorCanvas } from '../../场/2-门口/门口.tsx';
import { line8Tone } from '../../场/2-门口/第8句.ts';
import { RuneLyric, runeLyricDefault } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { definePicture } from '@engine/段/段画面.tsx';
import seg, { frameWindow } from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { use当前帧 } from '../../当前帧.ts';

const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, frameWindow.起帧));

const picture: React.FC = () => {
  const f = use当前帧();
  return (
    <>
      <FilmPost grade={line8Tone.grade} 种子={frameWindow.起帧 + f}>
        <DoorCanvas doorOpen chestOpen={1} tone={line8Tone} {...fullScreenShot} 叠层={<PuffBubble framing={fullScreenShot.framing} />}>
          <PuffCharacter />
        </DoorCanvas>
        <RuneLyric lines={lyricLines} 样式={{ ...runeLyricDefault, outlineColor: line8Tone.outlineColor }} />
      </FilmPost>
    </>
  );
};

export default definePicture(seg, soundUrl, picture);
