// 正片第 15 句后半（49.54–52.94），隐世之境你的视角一镜到底：风散开、她回头 → 对视（封面帧）→ 递蛋糕、驯服、她笑，一路慢慢推向她的脸。画法在 场/2-隐世之境/重逢.tsx（按歌曲帧画）。
// 叠层（整片后期里面）：上一段卷过来的樱花风（转场后从 风散心 散开，花瓣接着上一镜的位置飞），上面是符文歌词。
// 歌词：15 句都交给符文歌词（这一段里只剩第 15 句「爱炙热的你却忘了爱自己」），放在画面底部（第 15 句的特例，同 2-归隐、2-合照），接着上一段、留到段尾接 15 尾。
// 左下那行「Steve加入了游戏」不接过来：文字一时只走一路（用户 10-24 点名这一帧气泡、聊天行、歌词三路字一起出）。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { fps, 段时钟 } from '../../分镜.ts';
import { 色板 } from '../../色板.ts';
import { 符文歌词 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 音效轨 } from '../../声音/音效轨.tsx';
import { 樱花风 } from '../../特效/樱花风.tsx';
import { 第15句符文样式 } from '../../场/2-门口/归隐歌词.ts';
import { 第15句风, 铃在画面 } from '../../场/2-门口/摇铃.tsx';
import { 重逢画面, 风散心 } from '../../场/2-隐世之境/重逢.tsx';
import 段 from './段.ts';
import 铃url from 'asset:音效/万法皆通/wind_seeking_bell';
import 风url from 'asset:音效/item.elytra.flying';
import 推门url from 'asset:音效/block.wooden_door.open.1';

const 键 = '2-重逢';
const 起帧 = 段时钟(键).场窗口.起帧;
const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 起帧));
const 歌词样式 = { ...第15句符文样式, 描边色: 色板['归隐之地'].描边 };

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
            <樱花风 秒={帧 / fps} 时刻={第15句风} 源={铃在画面} 散心={风散心} />
            <符文歌词 行们={行们} 样式={歌词样式} />
          </>
        }
      />
    </AbsoluteFill>
  );
};

export default 画面;
