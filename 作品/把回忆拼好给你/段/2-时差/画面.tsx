// 2-时差 的画面：第 f 帧画歌曲帧 起帧 + f 的分屏（场/2-门口/时差分屏.tsx），开头两屏从右下滑进来（接入）。
// 符文歌词（全片 15 行，按歌自己进出）叠在两屏和分屏线上面、整页那层质感里面：不跟哪一屏调色（两屏一冷一暖），描边色取服务器那半的调子。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 插调子 } from '@engine/三渲二/调子.ts';
import { 段时钟 } from '../../分镜.ts';
import { 分屏态 } from '../../场/2-门口/分屏参数.ts';
import { 时差分屏 } from '../../场/2-门口/时差分屏.tsx';
import { 色板 } from '../../色板.ts';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import 段 from './段.ts';

const 起帧 = 段时钟('2-时差').场窗口.起帧;
const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 起帧));

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const 帧 = 起帧 + f;
  const 态 = 分屏态(帧);
  // 同 时差分屏.tsx 的 服务器调子
  const 描边色 = 插调子(插调子(色板.夏日白天, 色板.褪色, 态.褪色), 色板.夜, 态.夜).描边;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <配乐音轨 song={原声} 段={段} />
      <时差分屏 帧={帧} 接入 种子={帧} 叠层={<符文歌词 行们={行们} 样式={{ ...符文歌词默认, 描边色 }} />} />
    </AbsoluteFill>
  );
};

export default 画面;
