// 段框架示范续的画面：夜空，画面外远处那一发的余光在左下角退掉（远处炸 在本段之前，事件秒是负的）。
import { AbsoluteFill, interpolate } from 'remotion';
import { definePicture, useSeg } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';

export default definePicture(seg, soundUrl, () => {
  const { 秒: sec, 事件: events, 段: thisSegment } = useSeg(seg);
  const afterglow = interpolate(sec, [events.远处炸, events.远处炸 + 1.25], [0.6, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(#0b1030, #1d2450)' }}>
      <svg width={thisSegment.宽} height={thisSegment.高}>
        <defs>
          <radialGradient id="余光">
            <stop offset="0" stopColor="#ffb86b" stopOpacity={1} />
            <stop offset="1" stopColor="#ffb86b" stopOpacity={0} />
          </radialGradient>
        </defs>
        <circle cx={thisSegment.宽 * 0.18} cy={thisSegment.高 * 0.7} r={thisSegment.高 * 0.35} fill="url(#余光)" opacity={afterglow} />
      </svg>
    </AbsoluteFill>
  );
});
