// 段框架示范的画面：夜空里一发火箭升起、炸开、火星闪烁。时刻全从 useSeg() 的事件段内秒取，声音由 definePicture 照 段.ts 的 cue 自动放。
import { AbsoluteFill, interpolate } from 'remotion';
import { definePicture, useSeg } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';

const sparkCount = 16;

export default definePicture(seg, soundUrl, () => {
  const { sec: sec, events: events, segment: thisSegment } = useSeg(seg);
  const riseProgress = interpolate(sec, [events.launch, events.burst], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scatter = interpolate(sec, [events.burst, events.burst + 0.75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dim = interpolate(sec, [events.burst + 0.25, thisSegment.sec], [1, 0.25], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const centerX = thisSegment.width / 2;
  const blastPointY = thisSegment.height * 0.32;
  const rocketY = interpolate(riseProgress, [0, 1], [thisSegment.height * 0.95, blastPointY]);
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(#0b1030, #1d2450)' }}>
      <svg width={thisSegment.width} height={thisSegment.height}>
        {sec >= events.launch && sec < events.burst && <rect x={centerX - 3} y={rocketY} width={6} height={18} fill="#f4d58d" />}
        {sec >= events.burst &&
          Array.from({ length: sparkCount }, (_, i) => {
            const angle = (i / sparkCount) * Math.PI * 2;
            const r = scatter * 160;
            // 火星 1/6 秒闪一回，相邻的错开 1/24 秒
            const flicker = sec >= events.crackle && (sec * 24 + i) % 4 < 2 ? 1 : 0.55;
            return <rect key={i} x={centerX + Math.cos(angle) * r - 4} y={blastPointY + Math.sin(angle) * r + scatter * scatter * 40 - 4} width={8} height={8} fill={i % 2 ? '#ff7eb6' : '#ffd166'} opacity={dim * flicker} />;
          })}
      </svg>
    </AbsoluteFill>
  );
});
