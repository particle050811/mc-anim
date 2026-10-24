// 2-归隐 的画面：第 f 帧画歌曲帧 起帧 + f（场/2-门口/归隐.tsx：分屏 → 樱花风 → 合屏）。
// 符文歌词同 2-时差：叠在两屏上面、整页那层质感里面，描边色取服务器那半的调子；第 15 句放到底部（场/2-门口/归隐歌词.ts）。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 段时钟 } from '../../分镜.ts';
import { 左调子, 归隐画面 } from '../../场/2-门口/归隐.tsx';
import { 归隐歌词, 第15句符文样式 } from '../../场/2-门口/归隐歌词.ts';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 音效轨 } from '../../声音/音效轨.tsx';
import 段 from './段.ts';
import 钟声url from 'asset:音效/把回忆拼好给你/block.bell.use.1';
import 纸声2 from 'asset:音效/item.book.page_turn.2';
import 纸声3 from 'asset:音效/item.book.page_turn.3';
import 取出url from 'asset:音效/把回忆拼好给你/entity.glow_item_frame.remove_item.1';
import 铃url from 'asset:音效/万法皆通/wind_seeking_bell';
import 风url from 'asset:音效/item.elytra.flying';

const 起帧 = 段时钟('2-归隐').场窗口.起帧;
const 歌词 = 归隐歌词(起帧);

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const 帧 = 起帧 + f;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <配乐音轨 song={原声} 段={段} />
      <音效轨 src={钟声url} 资产="音效/把回忆拼好给你/block.bell.use.1" 段={段} />
      <音效轨 src={纸声3} 资产="音效/item.book.page_turn.3" 段={段} />
      <音效轨 src={纸声2} 资产="音效/item.book.page_turn.2" 段={段} />
      <音效轨 src={取出url} 资产="音效/把回忆拼好给你/entity.glow_item_frame.remove_item.1" 段={段} />
      <音效轨 src={铃url} 资产="音效/万法皆通/wind_seeking_bell" 段={段} />
      <音效轨 src={风url} 资产="音效/item.elytra.flying" 段={段} />
      <归隐画面
        帧={帧}
        种子={帧}
        叠层={
          <>
            <符文歌词 行们={歌词.上行们} 收={歌词.上收} 样式={{ ...符文歌词默认, 描边色: 左调子(帧).描边 }} />
            <符文歌词 行们={歌词.下行们} 样式={{ ...第15句符文样式, 描边色: 左调子(帧).描边 }} />
          </>
        }
      />
    </AbsoluteFill>
  );
};

export default 画面;
