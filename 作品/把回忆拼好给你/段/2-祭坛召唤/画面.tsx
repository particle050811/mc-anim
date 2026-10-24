// 2-祭坛召唤 的画面：场/2-祭坛/祭坛.tsx 的整个画面（天 + 三渲二画布），外面整片后期（夏日白天的调色，颗粒种子 = 歌曲帧），
// 顶上第 1～15 句的符文歌词（在这段里出现的只有第 3 句和第 4 句提前进场的那一截），描边色跟调子。
// 歌词浮在最上面、不过后期：同 2-日落划船（第 4 句开头还是这一镜，歌词两边一样，接缝上字不变色）
import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { 段窗口 } from '../../分镜.ts';
import { 色板 } from '../../色板.ts';
import { 祭坛画面 } from '../../场/2-祭坛/祭坛.tsx';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 音效轨 } from '../../声音/音效轨.tsx';
import 段 from './段.ts';
import 合成声 from 'asset:音效/把回忆拼好给你/touhou_little_maid.block.altar_craft.2';

const 起帧 = 段窗口('2-祭坛召唤').起帧;
const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 起帧));
const 歌词样式 = { ...符文歌词默认, 描边色: 色板.夏日白天.描边 };

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const g = 起帧 + f;
  return (
    <>
      <配乐音轨 song={原声} 段={段} />
      <音效轨 src={合成声} 资产="音效/把回忆拼好给你/touhou_little_maid.block.altar_craft.2" 段={段} />
      <整片后期 调色={色板.夏日白天.调色} 种子={g}>
        <祭坛画面 g={g} />
      </整片后期>
      <符文歌词 行们={行们} 样式={歌词样式} />
    </>
  );
};

export default 画面;
