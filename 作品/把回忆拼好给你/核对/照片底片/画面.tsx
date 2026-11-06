// 照片底片核对的画面：按视图表一帧画一张照片的干净帧（整页就是成片那一帧，不写名字）。各场自己的干净画法，这里只挑帧、关后期。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { 光影范围 } from '@engine/三渲二/画布.tsx';
import { 光影段 } from '../../默认.ts';
import { 事件 as 正片第3句事件 } from '../../分镜/正片第3句.ts';
import { 事件 as 正片第5句事件 } from '../../分镜/正片第5句.ts';
import { 祭坛画面 } from '../../场/2-祭坛/祭坛.tsx';
import { 日落划船照片 } from '../../场/2-海上/海上.tsx';
import { 末地镜头 } from '../../场/2-末地/镜头.tsx';
import { 事 as 末地事 } from '../../场/2-末地/编排.ts';
import { 光柱破云画面 } from '../../场/2-雷雨/画面.tsx';
import { 照片帧 } from '../../场/2-门口/门口之夜参数.ts';
import { 门口之夜画布 } from '../../场/2-门口/门口之夜画布.tsx';
import { 合照照片 } from '../../场/2-隐世之境/合照.tsx';
import { 视图们, type 底片名 } from './视图.ts';
import { use视图下标 } from '@engine/段/时间.tsx';

const 正片事件 = { ...正片第3句事件, ...正片第5句事件 };

const 一张: Record<底片名, () => React.ReactNode> = {
  递蛋糕: () => <祭坛画面 g={正片事件['照片-祭坛递蛋糕'].帧} />,
  日落划船: () => <日落划船照片 后期={false} />,
  扑龙蛋: () => <末地镜头 f={末地事['照片-扑龙蛋']} 干净 后期={false} />,
  // 照段 2-拨开阴霾 开光影：天和云是那一段的 Photon 雨云（用户 11-03「后面一个镜头的云怎么还是原版？」，照片墙上这张跟着换）
  光柱破云: () => (
    <光影范围.Provider value={{ 光影: 光影段['2-拨开阴霾'] }}>
      <光柱破云画面 后期={false} />
    </光影范围.Provider>
  ),
  合照: () => <门口之夜画布 帧={照片帧} />,
  新合照: () => <合照照片 后期={false} />,
};

const 画面: React.FC = () => <AbsoluteFill style={{ background: '#000000' }}>{一张[视图们[use视图下标()]!.名]()}</AbsoluteFill>;

export default 画面;
