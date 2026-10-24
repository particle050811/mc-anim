// 2-明年六月见 的画面：场/2-门口/门口之夜画布.tsx 按歌曲帧画，外面包夜的整片后期（颗粒种子 = 歌曲帧，牌面上不盖颗粒），符文歌词在顶上、一起过后期（同 核对-歌词艺术字小样）。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { 段时钟 } from '../../分镜.ts';
import { 色板 } from '../../色板.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 门口之夜画布 } from '../../场/2-门口/门口之夜画布.tsx';
import { 牌面矩形 } from '../../场/2-门口/门口之夜参数.ts';
import { 门口之夜音效轨 } from '../../场/2-门口/门口之夜音效轨.tsx';
import 段 from './段.ts';

const 起帧 = 段时钟('2-明年六月见').场窗口.起帧;
const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 起帧));
const 样式 = { ...符文歌词默认, 描边色: 色板.夜.描边 };

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <配乐音轨 song={原声} 段={段} />
      <门口之夜音效轨 段={段} />
      <整片后期 调色={色板.夜.调色} 种子={起帧 + f} 颗粒让开={牌面矩形(起帧 + f)}>
        <门口之夜画布 帧={起帧 + f} />
        <符文歌词 行们={行们} 样式={样式} />
      </整片后期>
    </AbsoluteFill>
  );
};

export default 画面;
