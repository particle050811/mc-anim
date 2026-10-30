// 段框架示范的画面：夜空里一发火箭升起、炸开、火星闪烁。时刻全从 use段() 的事件段内帧取，声音由 定义画面 照 段.ts 的 cue 自动放。
import { AbsoluteFill, interpolate } from 'remotion';
import { 定义画面, use段 } from '@engine/段/段画面.tsx';
import 段 from './段.ts';
import 声音 from './声音地址.生成.ts';

const 火星数 = 16;

export default 定义画面(段, 声音, () => {
  const { 帧, 事件, 段: 本段 } = use段(段);
  const 升 = interpolate(帧, [事件.发射, 事件.炸开], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const 散 = interpolate(帧, [事件.炸开, 事件.炸开 + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const 暗 = interpolate(帧, [事件.炸开 + 6, 本段.帧数], [1, 0.25], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const 中x = 本段.宽 / 2;
  const 炸点y = 本段.高 * 0.32;
  const 火箭y = interpolate(升, [0, 1], [本段.高 * 0.95, 炸点y]);
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(#0b1030, #1d2450)' }}>
      <svg width={本段.宽} height={本段.高}>
        {帧 >= 事件.发射 && 帧 < 事件.炸开 && <rect x={中x - 3} y={火箭y} width={6} height={18} fill="#f4d58d" />}
        {帧 >= 事件.炸开 &&
          Array.from({ length: 火星数 }, (_, i) => {
            const 角 = (i / 火星数) * Math.PI * 2;
            const r = 散 * 160;
            const 闪 = 帧 >= 事件.噼啪 && (帧 + i) % 4 < 2 ? 1 : 0.55;
            return <rect key={i} x={中x + Math.cos(角) * r - 4} y={炸点y + Math.sin(角) * r + 散 * 散 * 40 - 4} width={8} height={8} fill={i % 2 ? '#ff7eb6' : '#ffd166'} opacity={暗 * 闪} />;
          })}
      </svg>
    </AbsoluteFill>
  );
});
