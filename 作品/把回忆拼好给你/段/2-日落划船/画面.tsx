// 2-日落划船 的画面：整帧照 场/2-海上/海上.tsx 画（眼睛特写 → 叠化 → 日落的海 → 浪），歌词浮在最上面、不过后期。
// 眼睛特写就是第 3 句祭坛那一镜接着推：场/2-祭坛 的 祭坛画面（同一个场景、同一片天，她停在 末态.ts 那样），镜头换成 场/2-海上 的 眼机位，接缝上不跳。
// 歌词把 15 句都交给符文歌词（它自己按时刻挑出这一段里看得见的：第 3 句的退场、第 4 句、第 5 句的进场），描边色跟着当下的镜头走。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { 光影范围 } from '@engine/三渲二/画布.tsx';
import { 色板 } from '../../色板.ts';
import { 符文歌词 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 符文歌词默认 } from '../../界面/符文排版.ts';
import { 光影段 } from '../../默认.ts';
import { 叠化样式, 浪样式, 海调子名, 眼调子名 } from '../../场/2-海上/参数.ts';
import { 叠化, 歌曲帧, 眼机位, 窗 } from '../../场/2-海上/编排.ts';
import { 日落划船画面 } from '../../场/2-海上/海上.tsx';
import { 祭坛画面 } from '../../场/2-祭坛/祭坛.tsx';
import { 定义画面 } from '@engine/段/段画面.tsx';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';
import { use当前帧 } from '../../当前帧.ts';

const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 窗.起帧));
// 眼睛特写是 2-祭坛召唤 那一镜接着推，光影跟它走（接缝上不跳）；海那块照本段的（海上.tsx）
const 眼睛 = (g: number) => (
  <光影范围.Provider value={{ 光影: 光影段['2-祭坛召唤'] }}>
    <祭坛画面 g={g} 机={眼机位(g)} />
  </光影范围.Provider>
);

const 画面: React.FC = () => {
  const f = use当前帧();
  const g = 歌曲帧(f);
  // 叠化过半就换成海那套的描边色
  const 描边色 = 色板[叠化(g) < 0.5 ? 眼调子名 : 海调子名].描边;
  return (
    <AbsoluteFill>
      <日落划船画面 歌曲帧={g} 眼睛={眼睛} 叠化样式={叠化样式} 浪样式={浪样式} />
      <符文歌词 行们={行们} 样式={{ ...符文歌词默认, 描边色 }} />
    </AbsoluteFill>
  );
};

export default 定义画面(段, 声音地址, 画面);
