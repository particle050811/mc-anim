// 2-选择世界 的画面：原版「选择世界」界面（场/2-选择世界），取景定在「新的世界」那一项上不动；光标、指着、选中、搜索框光标照 编排.ts 按歌曲帧走。
// 整片后期用现实的调子（冷、灰一点：高考后坐在电脑前），歌词浮在最上面、一起过后期（同 核对/歌词艺术字小样）。
import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { 段窗口 } from '../../分镜.ts';
import { 色板 } from '../../色板.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 选择世界 } from '../../场/2-选择世界/选择世界.tsx';
import { 光标在, 平常取景, 指着在, 框光标亮, 选中在 } from '../../场/2-选择世界/编排.ts';
import { 旧图标 } from '../../场/2-选择世界/图标源.ts';
import 段 from './段.ts';

const 起帧 = 段窗口('2-选择世界').起帧;
const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 起帧));
const 调 = 色板.现实;

const 画面: React.FC = () => {
  const 歌帧 = 起帧 + useCurrentFrame();
  return (
    <>
      <整片后期 调色={调.调色} 种子={歌帧}>
        <选择世界
          状态={{ 取景: 平常取景, 指着: 指着在(歌帧), 选中: 选中在(歌帧), 框光标: 框光标亮(歌帧, 起帧), 光标: 光标在(歌帧), 图标: 旧图标 }}
        />
        <符文歌词 行们={行们} 样式={{ ...符文歌词默认, 描边色: 调.描边 }} />
      </整片后期>
      <配乐音轨 song={原声} 段={段} />
    </>
  );
};

export default 画面;
