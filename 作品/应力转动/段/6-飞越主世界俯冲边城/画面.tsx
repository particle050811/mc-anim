// 迁移生成：照旧 6-2至6-3段界/段表.ts 的 6-2-5至6-3-3 截表，把旧段组件按 [从, 到) 拼起来（6-3-2 用带思索界面的整片版）。
import React from 'react';
import { 拼段 } from '@engine/core/拼段.tsx';
import { FlyOverworld } from '../../地点/边城/6-2-5/飞越主世界.tsx';
import { BorderTownAhead } from './6-2-6/边城在望.tsx';
import { BackToBorderTown } from './6-3-1/又回到边城.tsx';
import { RollerPonder } from './6-3-2/思索.tsx';
import { DiveIn } from './6-3-3/俯冲.tsx';
import { segmentFrames as frames625 } from '../../地点/边城/6-2-5/编排/时间线.ts';
import { 段帧数 } from '../../地点/边城/6-3-下坠/时间线.ts';

const 截们 = [
  { 段: '6-2-5', 画: FlyOverworld, 从: 0, 到: frames625('6-2-5') },
  { 段: '6-2-6', 画: BorderTownAhead, 从: 1, 到: frames625('6-2-6') },
  { 段: '6-3-1', 画: BackToBorderTown, 从: 1, 到: 段帧数('6-3-1') },
  { 段: '6-3-2', 画: RollerPonder, 从: 1, 到: 段帧数('6-3-2') },
  { 段: '6-3-3', 画: DiveIn, 从: 1, 到: 段帧数('6-3-3') },
];

const 画面: React.FC = () => <拼段 截们={截们} />;
export default 画面;
