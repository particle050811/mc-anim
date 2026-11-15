// 歌词艺术字核对的画面：底 + 全片 15 句符文歌词（全片默认样式加这一底调子的描边色，排法照 歌词排版表.ts），一起包在这一底调子的整片后期里（颗粒种子 = 歌词那一帧，同片子）。不写视图名：静帧就是成片的样子。
// 亮天空：门口机位 N = 6 整屏取景、正午（刻 6000，太阳正在字后面）；门口：核对-门口哈气 的定稿那一帧（第 8 句 N = 10 整屏镜头，她冲苦力怕哈气）；
// 夜：同一机位 N = 10、午夜（刻 18000）、樱花树长成、调子 夜（月亮、树冠在字后面）；对视：第 15 句 49.96 那一帧（对视画面 片 版，它自己的后期关掉、在这里包，歌词才在后期里）。
// 分屏、归隐：第 13、14 句那两段的场画这一帧，歌词叠在场自己的后期里面（同 2-时差、2-归隐 的画面）。
// 前四种底是定住的一帧，只有歌词按视图的帧走。
import type React from 'react';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { lerpTone, type Tone } from '@engine/三渲二/调子.ts';
import { PuffCharacter, PuffBubble } from '../../场/2-门口/哈气.tsx';
import { framing as n6Framing, fullScreenShot } from '../../场/2-门口/参数.ts';
import { SplitState } from '../../场/2-门口/分屏参数.ts';
import { TimeLagSplit } from '../../场/2-门口/时差分屏.tsx';
import { leftToneAt, RetreatPicture } from '../../场/2-门口/归隐.tsx';
import { DoorCanvas } from '../../场/2-门口/门口.tsx';
import { line8Tone } from '../../场/2-门口/第8句.ts';
import { EyeContactPicture } from '../../场/2-隐世之境/对视.tsx';
import { palette } from '../../色板.ts';
import { RuneLyric, runeLyricDefault, type RuneLyricStyle } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { views, type BottomBackdrop } from './视图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';

const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1));

/** 门口那一帧（核对-门口哈气 的定稿帧） */
const doorBottom: React.FC = () => (
  <DoorCanvas doorOpen chestOpen={1} tone={line8Tone} {...fullScreenShot} 叠层={<PuffBubble framing={fullScreenShot.framing} />}>
    <PuffCharacter />
  </DoorCanvas>
);

const fixedBottoms: Record<Exclude<BottomBackdrop, '分屏' | '归隐'>, { tone: Tone; render: React.FC }> = {
  亮天空: { tone: palette.夏日白天, render: () => <DoorCanvas framing={n6Framing} outlineWidth={n6Framing.pxPerCell / 16} 刻={6000} tone="夏日白天" /> },
  门口: { tone: line8Tone, render: doorBottom },
  夜: { tone: palette.夜, render: () => <DoorCanvas {...fullScreenShot} 刻={18000} tone="夜" treeProgress={1} hasSign /> },
  对视: { tone: palette.归隐之地, render: () => <EyeContactPicture 版="片" withPost={false} /> },
};

const lyricsLayer = (frame: number, outlineColor: string) => <RuneLyric lines={lyricLines} 样式={{ ...runeLyricDefault, outlineColor } satisfies RuneLyricStyle} 帧={frame} />;

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  if (v.bottomBackdrop === '分屏') {
    // 同 2-时差：描边色取服务器那半的调子
    const splitState = SplitState(v.帧);
    return <TimeLagSplit 帧={v.帧} 种子={v.帧} 叠层={lyricsLayer(v.帧, lerpTone(palette.夏日白天, palette.褪色, splitState.褪色).outlineColor)} />;
  }
  if (v.bottomBackdrop === '归隐') return <RetreatPicture 帧={v.帧} 种子={v.帧} 叠层={lyricsLayer(v.帧, leftToneAt(v.帧).outlineColor)} />;
  const bottomBackdrop = fixedBottoms[v.bottomBackdrop];
  return (
    <FilmPost grade={bottomBackdrop.tone.grade} 种子={v.帧}>
      <bottomBackdrop.render />
      {lyricsLayer(v.帧, bottomBackdrop.tone.outlineColor)}
    </FilmPost>
  );
};

export default picture;
