// 6-2-5至6-3-3 飞越主世界俯冲边城：照旧 6-2至6-3段界/段表.ts 的 6-2-5至6-3-3 截表，把旧段组件按 [从, 到) 拼起来（6-3-2 用带思索界面的整片版），
// 截表的数是 1/24 秒一格，按秒放；声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import React from 'react';
import { 拼段 } from '@engine/core/拼段.tsx';
import { 定义画面 } from '@engine/段/段画面.tsx';
import { FlyOverworld } from '../../地点/边城/6-2-5/飞越主世界.tsx';
import { BorderTownAhead } from './6-2-6/边城在望.tsx';
import { BackToBorderTown } from './6-3-1/又回到边城.tsx';
import { RollerPonder } from './6-3-2/思索.tsx';
import { DiveIn } from './6-3-3/俯冲.tsx';
import { segmentFrames as frames625 } from '../../地点/边城/6-2-5/编排/时间线.ts';
import { FPS, 段帧数 } from '../../地点/边城/6-3-下坠/时间线.ts';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';

const 截们 = [
  { 段: '6-2-5', 画: FlyOverworld, 从: 0, 到: frames625('6-2-5') },
  { 段: '6-2-6', 画: BorderTownAhead, 从: 1, 到: frames625('6-2-6') },
  { 段: '6-3-1', 画: BackToBorderTown, 从: 1, 到: 段帧数('6-3-1') },
  { 段: '6-3-2', 画: RollerPonder, 从: 1, 到: 段帧数('6-3-2') },
  { 段: '6-3-3', 画: DiveIn, 从: 1, 到: 段帧数('6-3-3') },
];

export default 定义画面(段, 声音地址, () => <拼段 截们={截们} 每秒={FPS} />);
