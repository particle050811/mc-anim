// 2-烟花 的画面：场/2-门口/门口之夜画布.tsx 按歌曲帧画，外面包夜的整片后期（颗粒种子 = 歌曲帧的 旧帧号，照旧一秒换 24 次，牌面上不盖颗粒），符文歌词在顶上、一起过后期（同 核对-歌词艺术字小样）。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { fps, 旧帧, 旧帧号, 段时钟 } from '../../分镜.ts';
import { 色板 } from '../../色板.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 门口之夜画布 } from '../../场/2-门口/门口之夜画布.tsx';
import { 牌面矩形 } from '../../场/2-门口/门口之夜参数.ts';
import { 门口之夜音效轨 } from '../../场/2-门口/门口之夜音效轨.tsx';
import 段 from './段.ts';

const 起帧 = 段时钟('2-烟花').场窗口.起帧;
const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 起帧));
const 样式 = { ...符文歌词默认, 描边色: 色板.夜.描边 };

/** 前帧 取 1/24 秒以前（24 fps 时的上一帧，60 fps 时带小数）：屋后远景按它算画布高，学的是 24 fps 时看过的「读上一帧的高度」（docs/渲染性能.md 的 E），
 *  同一时刻的画面和 24 fps 时一样；段首 1/24 秒里不给 */
const 画面: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <配乐音轨 song={原声} 段={段} />
      <门口之夜音效轨 段={段} />
      <整片后期 调色={色板.夜.调色} 种子={旧帧号(起帧 + f)} 颗粒让开={牌面矩形(起帧 + f)}>
        <门口之夜画布 帧={起帧 + f} 前帧={f / fps >= 旧帧(1) ? 起帧 + f - fps * 旧帧(1) : undefined} />
        <符文歌词 行们={行们} 样式={样式} />
      </整片后期>
    </AbsoluteFill>
  );
};

export default 画面;
