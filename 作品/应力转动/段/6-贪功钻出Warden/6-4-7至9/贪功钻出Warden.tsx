// 6-4-7至9 贪功钻出Warden：刘心忠一跳踩出第四次尖啸 → 监守者钻出、二人急退摆架势 → 三个短特写、二人横挪逼近、吼，吼到一半硬切 7-1-1。
// 三截怎么拼见 时间线.ts，声音见 声音.tsx，各截的画面是 ../6-4-7/贪功.tsx、../6-4-8/钻出.tsx、../6-4-9/登场.tsx。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { GloryGrabView } from '../6-4-7/贪功.tsx';
import { EmergeView } from '../6-4-8/钻出.tsx';
import { RevealView } from '../6-4-9/登场.tsx';
import { GloryEmergeRevealSound } from './声音.tsx';
import { frameCount, partAt } from './时间线.ts';

export const gloryEmergeRevealFrames = frameCount;

export const GloryEmergeReveal: React.FC = () => {
  const { id, f } = partAt(useCurrentFrame());
  return (
    <>
      {id === '6-4-7' ? <GloryGrabView f={f} /> : id === '6-4-8' ? <EmergeView f={f} /> : <RevealView f={f} />}
      <GloryEmergeRevealSound />
    </>
  );
};
