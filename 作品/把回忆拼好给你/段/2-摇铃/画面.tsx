// 正片第 15 句开头（48.61–49.54），门这个机位：你上线、摇铃、樱花风盖满画面。画法在 场/2-门口/摇铃.tsx（按歌曲帧画），这里接上段的钟、声音和歌词。
// 歌词「爱炙热的你却忘了爱自己」素字放在画面底部（三稿第 15 句的特例），叠在整片后期外面；第 15 句起淡入，留到下一段。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 段时钟, 段内正片事件帧, 第几句 } from '../../分镜.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 音效轨 } from '../../声音/音效轨.tsx';
import { 底部歌词, 第15句歌词样式 } from '../../界面/底部歌词.tsx';
import { 摇铃画面 } from '../../场/2-门口/摇铃.tsx';
import 段 from './段.ts';
import 铃url from 'asset:音效/万法皆通/wind_seeking_bell';
import 风url from 'asset:音效/item.elytra.flying';

const 键 = '2-摇铃';
const 起帧 = 段时钟(键).场窗口.起帧;
const 事件帧 = 段内正片事件帧(键);

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <配乐音轨 song={原声} 段={段} />
      <音效轨 src={铃url} 资产="音效/万法皆通/wind_seeking_bell" 段={段} />
      <音效轨 src={风url} 资产="音效/item.elytra.flying" 段={段} />
      <摇铃画面 帧={起帧 + f} />
      <底部歌词 行们={[{ 词: 第几句(15).词, 入: 事件帧.第15句加入游戏 }]} 样式={第15句歌词样式} />
    </AbsoluteFill>
  );
};

export default 画面;
