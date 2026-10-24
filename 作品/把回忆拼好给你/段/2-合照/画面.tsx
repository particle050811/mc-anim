// 正片 15 尾（52.94–55.08），隐世之境：从 2-重逢 你的视角硬切到侧面合照，她靠到你肩上 → 咔哒闪白。画法在 场/2-隐世之境/合照.tsx（按歌曲帧画）。
// 歌词：15 句都交给符文歌词（这一段里只剩第 15 句「爱炙热的你却忘了爱自己」），样式同 2-重逢（底部），硬切那一下歌词不跳；咔哒那一帧起退场，盖在白底下。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 段时钟, 段内正片事件帧 } from '../../分镜.ts';
import { 色板 } from '../../色板.ts';
import { 符文歌词 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 音效轨 } from '../../声音/音效轨.tsx';
import { 第15句符文样式 } from '../../场/2-门口/归隐歌词.ts';
import { 合照画面 } from '../../场/2-隐世之境/合照.tsx';
import 段 from './段.ts';
import 咔哒url from 'asset:音效/车万女仆/item.camera_use';

const 键 = '2-合照';
const 起帧 = 段时钟(键).场窗口.起帧;
const 事件帧 = 段内正片事件帧(键);
const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 起帧));
const 歌词样式 = { ...第15句符文样式, 描边色: 色板['归隐之地'].描边 };

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <配乐音轨 song={原声} 段={段} />
      <音效轨 src={咔哒url} 资产="音效/车万女仆/item.camera_use" 段={段} />
      <合照画面 帧={起帧 + f} 叠层={<符文歌词 行们={行们} 样式={歌词样式} 收={事件帧.合照咔哒} />} />
    </AbsoluteFill>
  );
};

export default 画面;
