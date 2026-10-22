// 迁移生成：照旧 6-2至6-3段界/段表.ts 的 6-3-4 截表，把旧段组件按 [从, 到) 拼起来（6-3-2 用带思索界面的整片版）。
import React from 'react';
import { 拼段 } from '@engine/core/拼段.tsx';
import { CityWatch } from './城防.tsx';
import { 段帧数 } from '../../地点/边城/6-3-下坠/时间线.ts';

const 截们 = [
  { 段: '6-3-4', 画: CityWatch, 从: 0, 到: 段帧数('6-3-4') },
];

const 画面: React.FC = () => <拼段 截们={截们} />;
export default 画面;
