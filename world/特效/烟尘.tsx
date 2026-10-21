// 烟雾、扬尘、碎屑：都是按时间参数算出来的低面数粒子，没有模拟状态，任意帧可单独渲染。
import React from 'react';
import { Box, Ball, V3, rng, pick } from '../../engine/model/parts.tsx';

export const FX = { smoke: '#c4c6bc', smokeDark: '#9ea096', dust: '#b8a888' };

// 化烟：一团团圆烟往上冒、变大、变淡。t 0→1 为整个过程，size 为冒烟物体的尺寸
export const SmokePuffs: React.FC<{ t: number; size: number; seed: number; count?: number }> = ({ t, size, seed, count = 6 }) => {
  if (t < 0 || t > 1) return null;
  const rand = rng(seed);
  return (
    <>
      {Array.from({ length: count }, (_, k) => {
        const jitter = rand();
        const angle = (k / count) * Math.PI * 2 + jitter * 1.2;
        const dist = size * (0.2 + 0.8 * t) * (0.6 + 0.6 * rand());
        const rad = size * (0.25 + 0.4 * t) * (0.7 + 0.5 * jitter);
        return (
          <Ball key={k} p={[Math.cos(angle) * dist, Math.sin(angle) * dist, size * 0.4 + t * size * 1.5 * (0.5 + jitter)]} rad={rad} c={k % 3 ? FX.smoke : FX.smokeDark} opacity={0.85 * (1 - t) ** 1.3} shadow={false} />
        );
      })}
    </>
  );
};

// 扬尘：落点处贴地散开的尘团。puffs 里每个元素是 [位置, 已经过去的比例 0→1]
export const DustPuffs: React.FC<{ puffs: [V3, number][] }> = ({ puffs }) => (
  <>
    {puffs.map(([pos, t], i) =>
      t >= 0 && t <= 1 ? <Ball key={i} p={[pos[0], pos[1], pos[2] + 0.15 + t * 0.4]} rad={0.2 + t * 0.55} c={FX.dust} opacity={0.6 * (1 - t)} shadow={false} /> : null,
    )}
  </>
);

// 碎屑：从 origin 往外迸出的小方块，受重力落地。sec 为迸出后经过的秒数
export const Debris: React.FC<{ sec: number; origin: V3; seed: number; colors: readonly string[]; count?: number; speed?: number }> = ({
  sec, origin, seed, colors, count = 14, speed = 4,
}) => {
  if (sec < 0 || sec > 1.2) return null;
  const rand = rng(seed);
  return (
    <>
      {Array.from({ length: count }, (_, k) => {
        const angle = rand() * Math.PI * 2;
        const hSpeed = speed * (0.5 + rand());
        const up = 3 + rand() * 4;
        const z = Math.max(0.1, origin[2] + up * sec - 4.9 * sec * sec);
        const cubeSize = 0.12 + rand() * 0.2;
        const fade = sec > 0.8 ? (1.2 - sec) / 0.4 : 1;
        return (
          <Box key={k} p={[origin[0] + Math.cos(angle) * hSpeed * sec, origin[1] + Math.sin(angle) * hSpeed * sec, z]} s={[cubeSize * fade, cubeSize * fade, cubeSize * fade]} r={[sec * 9 * rand(), sec * 7, 0]} c={pick(rand, colors)} />
        );
      })}
    </>
  );
};
