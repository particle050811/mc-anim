// 2-日落划船 的画面：整帧照 场/2-海上/海上.tsx 画（眼睛特写 → 叠化 → 日落的海 → 浪），歌词浮在最上面、不过后期。
// 眼睛特写就是第 3 句祭坛那一镜接着推：场/2-祭坛 的 祭坛画面（同一个场景、同一片天，她停在 末态.ts 那样），镜头换成 场/2-海上 的 眼机位，接缝上不跳。
// 歌词把 15 句都交给符文歌词（它自己按时刻挑出这一段里看得见的：第 3 句的退场、第 4 句、第 5 句的进场），描边色跟着当下的镜头走。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 色板 } from '../../色板.ts';
import { 符文歌词 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 符文歌词默认 } from '../../界面/符文排版.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 原声 } from '../../配乐/原声.ts';
import { 音效轨 } from '../../声音/音效轨.tsx';
import { 海调子名, 眼调子名 } from '../../场/2-海上/参数.ts';
import { 叠化, 歌曲帧, 眼机位, 窗 } from '../../场/2-海上/编排.ts';
import { 日落划船画面 } from '../../场/2-海上/海上.tsx';
import { 祭坛画面 } from '../../场/2-祭坛/祭坛.tsx';
import 段 from './段.ts';
import 桨声1 from 'asset:音效/把回忆拼好给你/entity.boat.paddle_water.1';
import 桨声2 from 'asset:音效/把回忆拼好给你/entity.boat.paddle_water.2';
import 桨声3 from 'asset:音效/把回忆拼好给你/entity.boat.paddle_water.3';
import 桨声4 from 'asset:音效/把回忆拼好给你/entity.boat.paddle_water.4';
import 浪声 from 'asset:音效/entity.player.splash.high_speed';

const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 窗.起帧));
const 眼睛 = (g: number) => <祭坛画面 g={g} 机={眼机位(g)} />;

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const g = 歌曲帧(f);
  // 叠化过半就换成海那套的描边色
  const 描边色 = 色板[叠化(g) < 0.5 ? 眼调子名 : 海调子名].描边;
  return (
    <AbsoluteFill>
      <配乐音轨 song={原声} 段={段} />
      <音效轨 src={桨声1} 资产="音效/把回忆拼好给你/entity.boat.paddle_water.1" 段={段} />
      <音效轨 src={桨声2} 资产="音效/把回忆拼好给你/entity.boat.paddle_water.2" 段={段} />
      <音效轨 src={桨声3} 资产="音效/把回忆拼好给你/entity.boat.paddle_water.3" 段={段} />
      <音效轨 src={桨声4} 资产="音效/把回忆拼好给你/entity.boat.paddle_water.4" 段={段} />
      <音效轨 src={浪声} 资产="音效/entity.player.splash.high_speed" 段={段} />
      <日落划船画面 歌曲帧={g} 眼睛={眼睛} />
      <符文歌词 行们={行们} 样式={{ ...符文歌词默认, 描边色 }} />
    </AbsoluteFill>
  );
};

export default 画面;
