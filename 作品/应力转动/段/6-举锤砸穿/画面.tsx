// 6-3-5至6 举锤砸穿：照旧 6-2至6-3段界/段表.ts 的 6-3-5至6 截表拼起来，截表的数是下坠时间线的格（1/24 秒），按秒放；
// 声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import React from 'react';
import { 拼段 } from '@engine/core/拼段.tsx';
import { 定义画面 } from '@engine/段/段画面.tsx';
import { RaiseMace } from './6-3-5/举锤.tsx';
import { SmashThrough } from './6-3-6/砸穿.tsx';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';
import { FPS, 段帧数 } from '../../地点/边城/6-3-下坠/时间线.ts';

const 截们 = [
  { 段: '6-3-5', 画: RaiseMace, 从: 0, 到: 段帧数('6-3-5') },
  { 段: '6-3-6', 画: SmashThrough, 从: 1, 到: 段帧数('6-3-6') },
];

export default 定义画面(段, 声音地址, () => <拼段 截们={截们} 每秒={FPS} />);
