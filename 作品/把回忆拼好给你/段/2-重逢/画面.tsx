// 正片第 15 句后半（49.54–52.94），隐世之境：推门 → 对视（封面帧）→ 蹲下递蛋糕、驯服、台词气泡 → 推向她的脸。画法在 场/2-隐世之境/重逢.tsx（按歌曲帧画）。
// 叠层（整片后期里面）：左下原版聊天栏那行「Steve加入了游戏」（48.61 进来的，按原版寿命走）、上一段卷过来的樱花风（转场后散开，花瓣接着上一镜的位置飞）。
// 歌词「爱炙热的你却忘了爱自己」接着上一段，素字放在画面底部，叠在整片后期外面，留到段尾接 15 尾。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { fps, 段时钟, 段内正片事件帧, 第几句 } from '../../分镜.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 音效轨 } from '../../声音/音效轨.tsx';
import { 底部歌词, 第15句歌词样式 } from '../../界面/底部歌词.tsx';
import { 樱花风 } from '../../特效/樱花风.tsx';
import { 加入游戏聊天, 第15句风, 铃在画面 } from '../../场/2-门口/摇铃.tsx';
import { 重逢画面 } from '../../场/2-隐世之境/重逢.tsx';
import 段 from './段.ts';
import 铃url from 'asset:音效/万法皆通/wind_seeking_bell';
import 风url from 'asset:音效/item.elytra.flying';
import 推门url from 'asset:音效/block.wooden_door.open.1';

const 键 = '2-重逢';
const 起帧 = 段时钟(键).场窗口.起帧;
const 事件帧 = 段内正片事件帧(键);

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const 帧 = 起帧 + f;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <配乐音轨 song={原声} 段={段} />
      <音效轨 src={铃url} 资产="音效/万法皆通/wind_seeking_bell" 段={段} />
      <音效轨 src={风url} 资产="音效/item.elytra.flying" 段={段} />
      <音效轨 src={推门url} 资产="音效/block.wooden_door.open.1" 段={段} />
      <重逢画面
        帧={帧}
        叠层={
          <>
            <加入游戏聊天 帧={帧} />
            <樱花风 秒={帧 / fps} 时刻={第15句风} 源={铃在画面} />
          </>
        }
      />
      <底部歌词 行们={[{ 词: 第几句(15).词, 入: 事件帧.第15句加入游戏 }]} 样式={第15句歌词样式} />
    </AbsoluteFill>
  );
};

export default 画面;
