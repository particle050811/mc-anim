// 2-祭坛召唤 的画面：场/2-祭坛/祭坛.tsx 的整个画面（天 + 三渲二画布），外面整片后期（夏日白天的调色，颗粒种子 = 歌曲帧），
// 顶上第 1～15 句的符文歌词（在这段里出现的只有第 3 句和第 4 句提前进场的那一截），描边色跟调子。
// 歌词浮在最上面、不过后期：同 2-日落划船（第 4 句开头还是这一镜，歌词两边一样，接缝上字不变色）
import type React from 'react';
import { shadingScope } from '@engine/三渲二/画布.tsx';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { segmentWindow } from '../../分镜/正片第3句.ts';
import { shadingBySeg } from '../../默认.ts';
import { palette } from '../../色板.ts';
import { AltarPicture } from '../../场/2-祭坛/祭坛.tsx';
import { RuneLyric, runeLyricDefault } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { use当前帧 } from '../../当前帧.ts';

const startFrame = segmentWindow('2-祭坛召唤').起帧;
const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, startFrame));
const lyricStyle = { ...runeLyricDefault, outlineColor: palette.夏日白天.outlineColor };

const picture: React.FC = () => {
  const f = use当前帧();
  const g = startFrame + f;
  return (
    <>
      <FilmPost grade={palette.夏日白天.grade} 种子={g}>
        {/* 光影照 默认.ts 的 光影段（甲版不开，乙版开 Agent 建议的） */}
        <shadingScope.Provider value={{ shading: shadingBySeg['2-祭坛召唤'] }}>
          <AltarPicture g={g} />
        </shadingScope.Provider>
      </FilmPost>
      <RuneLyric lines={lyricLines} 样式={lyricStyle} />
    </>
  );
};

export default definePicture(seg, soundUrl, picture);
