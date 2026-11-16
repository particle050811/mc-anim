// 第 1 场 6-1-1～6-1-4至9 各段的 Composition 组件：照 段界.ts 的截把原来那几个组件拼起来（lib/拼段.tsx）。
// 6-1-2 的伤害数字层同样按截拼（只有 6-1-2 斩娜迦那一截有数字），和 6-1-2 段同帧。
// 截表的数是各源组件的刻（1/120 秒，段界.ts 的 `CUT_STEPS_PER_SEC`），拼段 按秒换算。声音照各段 段.ts 的 cue 放，源组件不挂声音（决策 0015）。
import React from 'react';
import { SegmentStitch, type Clip } from '@engine/core/拼段.tsx';
import { EnterForest } from '../6-1-1/进入森林.tsx';
import { NagaBlockout } from '../6-1-2/娜迦参考模型.tsx';
import { official } from '../6-1-2/动作改进.ts';
import { NagaDamageLayer } from '../6-1-2/伤害数字层.tsx';
import { TakeOff } from '../6-1-3/起飞.tsx';
import { OnerSegment } from '../一镜到底/画面.tsx';
import { segments, frameCountOf, compositionId, CUT_STEPS_PER_SEC, type SegmentId, type SegmentSource } from './段界.ts';

const Naga: React.FC = () => <NagaBlockout {...official} />;
const NagaDamage: React.FC = () => <NagaDamageLayer {...official} />;
// 一镜到底的源时间就是它的画面时间 g，截表放到硬切 6-1-9b 那一刻（G_CUT）为止
const Oner: React.FC = () => <OnerSegment start={0} />;
const sourceComponents: Record<SegmentSource, React.FC> = { '6-1-1': EnterForest, '6-1-2': Naga, '6-1-3': TakeOff, 一镜到底: Oner };

const Empty: React.FC = () => null; // 透明层里没有数字的截
const piecesOf = (id: SegmentId, components: Partial<Record<SegmentSource, React.FC>>): (Clip & { picture: React.FC })[] =>
  segments.find((s) => s.id === id)!.cuts.map((p) => ({ segment: p.源, picture: components[p.源] ?? Empty, 从: p.从, dest: p.dest }));

const shots = segments.map((s) => {
  const pieces = piecesOf(s.id, sourceComponents);
  const Comp: React.FC = () => <SegmentStitch cuts={pieces} perSec={CUT_STEPS_PER_SEC} />;
  return { id: compositionId(s.id), component: Comp, frames: frameCountOf(s.id) };
});
// 注册用：<Shot {...scene1Shot('6-1-2')} />
export const scene1Shot = (id: SegmentId) => shots[segments.findIndex((s) => s.id === id)];

const damagePieces = piecesOf('6-1-2', { '6-1-2': NagaDamage });
export const NagaDamageSegment: React.FC = () => <SegmentStitch cuts={damagePieces} perSec={CUT_STEPS_PER_SEC} />;
