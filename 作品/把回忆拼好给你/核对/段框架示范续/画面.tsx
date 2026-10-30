// 段框架示范续的画面：夜空，画面外远处那一发的余光在左下角退掉（远处炸 在本段之前，事件帧是负的）。
import { AbsoluteFill, interpolate } from 'remotion';
import { 定义画面, use段 } from '@engine/段/段画面.tsx';
import 段 from './段.ts';
import 声音 from './声音地址.生成.ts';

export default 定义画面(段, 声音, () => {
  const { 帧, 事件, 段: 本段 } = use段(段);
  const 余光 = interpolate(帧, [事件.远处炸, 事件.远处炸 + 30], [0.6, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(#0b1030, #1d2450)' }}>
      <svg width={本段.宽} height={本段.高}>
        <defs>
          <radialGradient id="余光">
            <stop offset="0" stopColor="#ffb86b" stopOpacity={1} />
            <stop offset="1" stopColor="#ffb86b" stopOpacity={0} />
          </radialGradient>
        </defs>
        <circle cx={本段.宽 * 0.18} cy={本段.高 * 0.7} r={本段.高 * 0.35} fill="url(#余光)" opacity={余光} />
      </svg>
    </AbsoluteFill>
  );
});
