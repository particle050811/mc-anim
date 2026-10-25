// 正片第 14 句末到第 15 句开头（合屏到位 48.26 – 风散开 49.75），门这个机位：你上线、摇铃、樱花风盖满画面。画法在 场/2-门口/摇铃.tsx（按歌曲帧画），
//   这里接上段的钟、声音和歌词。
// 歌词两套同 2-归隐（场/2-门口/归隐歌词.ts，歌上同一帧画出来一样，接缝接得上）：顶上第 14 句「也为你骗自己放下」亮到你上线前退完，
//   第 15 句「爱炙热的你却忘了爱自己」在底部，等聊天行淡掉才进（下一段 2-重逢 里）；描边色取这一帧的调子。用户 10-24「还在用素字歌词的段换成符文歌词」。叠在整片后期里面。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 段时钟 } from '../../分镜.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 音效轨 } from '../../声音/音效轨.tsx';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 归隐歌词, 第15句符文样式 } from '../../场/2-门口/归隐歌词.ts';
import { 摇铃画面, 摇铃调子 } from '../../场/2-门口/摇铃.tsx';
import 段 from './段.ts';
import 铃url from 'asset:音效/万法皆通/wind_seeking_bell';
import 风url from 'asset:音效/item.elytra.flying';

const 起帧 = 段时钟('2-摇铃').场窗口.起帧;
const 歌词 = 归隐歌词(起帧);

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const 帧 = 起帧 + f;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <配乐音轨 song={原声} 段={段} />
      <音效轨 src={铃url} 资产="音效/万法皆通/wind_seeking_bell" 段={段} />
      <音效轨 src={风url} 资产="音效/item.elytra.flying" 段={段} />
      <摇铃画面
        帧={帧}
        叠层={
          <>
            <符文歌词 行们={歌词.上行们} 样式={{ ...符文歌词默认, 描边色: 摇铃调子(帧).描边 }} />
            <符文歌词 行们={歌词.下行们} 样式={{ ...第15句符文样式, 描边色: 摇铃调子(帧).描边 }} />
          </>
        }
      />
    </AbsoluteFill>
  );
};

export default 画面;
