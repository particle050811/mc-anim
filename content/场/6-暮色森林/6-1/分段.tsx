// 第 1 场 6-1-1～6-1-4至9 各段的 Composition 组件：照 段界.ts 的截把原来那几个组件拼起来（lib/拼段.tsx）。
// 6-1-2 的伤害数字层同样按截拼（只有 6-1-2 斩娜迦那一截有数字），和 6-1-2 段同帧。
import React from 'react';
import { 拼段, type 截 } from '../../../../engine/core/拼段.tsx';
import { EnterForest } from '../6-1-1/进入森林.tsx';
import { NagaBlockout } from '../6-1-2/娜迦参考模型.tsx';
import { official } from '../6-1-2/动作改进.ts';
import { NagaDamageLayer } from '../6-1-2/伤害数字层.tsx';
import { TakeOff } from '../6-1-3/起飞.tsx';
import { OnerSegment } from '../一镜到底/画面.tsx';
import { F_CUT } from '../6-1-9b/落地编排.ts';
import { segments, frameCountOf, compositionId, type SegmentId, type 源 } from './段界.ts';

const Naga: React.FC = () => <NagaBlockout {...official} />;
const NagaDamage: React.FC = () => <NagaDamageLayer {...official} />;
// 一镜到底的源帧就是全局帧 F，放到硬切 6-1-9b 那一帧（F_CUT）为止
const Oner: React.FC = () => <OnerSegment 起={0} 帧数={F_CUT} />;
const sourceComponents: Record<源, React.FC> = { '6-1-1': EnterForest, '6-1-2': Naga, '6-1-3': TakeOff, 一镜到底: Oner };

const Empty: React.FC = () => null; // 透明层里没有数字的截
const piecesOf = (id: SegmentId, components: Partial<Record<源, React.FC>>): (截 & { 画: React.FC })[] =>
  segments.find((s) => s.id === id)!.截们.map((p) => ({ 段: p.源, 画: components[p.源] ?? Empty, 从: p.从, 到: p.到 }));

const shots = segments.map((s) => {
  const pieces = piecesOf(s.id, sourceComponents);
  const Comp: React.FC = () => <拼段 截们={pieces} />;
  return { id: compositionId(s.id), component: Comp, frames: frameCountOf(s.id) };
});
// 注册用：<Shot {...scene1Shot('6-1-2')} />
export const scene1Shot = (id: SegmentId) => shots[segments.findIndex((s) => s.id === id)];

const damagePieces = piecesOf('6-1-2', { '6-1-2': NagaDamage });
export const NagaDamageSegment: React.FC = () => <拼段 截们={damagePieces} />;
export const NAGA_SEGMENT_FRAMES = frameCountOf('6-1-2');
