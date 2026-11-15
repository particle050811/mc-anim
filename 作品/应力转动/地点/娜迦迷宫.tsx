// 娜迦迷宫中央水池的火盆火焰（娜迦庭院 在用）。
import React from 'react';
import { Cyl } from '@engine/model/parts.tsx';
const palette = { fire: '#ffb040', fireCore: '#fff0a0' };
// 火盆火焰：两层发光锥体，按时间 t（秒）闪动
export const Flame: React.FC<{ t: number; seed?: number }> = ({ t, seed = 0 }) => {
  const k = 1 + 0.14 * Math.sin(t * 17 + seed) + 0.08 * Math.sin(t * 29 + seed * 2);
  return (
    <group scale={[1, 1, k]}>
      <Cyl p={[0, 0, 0.45]} rt={0} rb={0.42} h={0.9} n={5} r={[0, 0, t * 2 + seed]} c={palette.fire} emissive={1.6} shadow={false} />
      <Cyl p={[0, 0, 0.3]} rt={0} rb={0.24} h={0.6} n={5} r={[0, 0, -t * 3]} c={palette.fireCore} emissive={2.2} shadow={false} />
      <pointLight position={[0, 0, 0.8]} color={palette.fire} intensity={6} distance={9} decay={2} />
    </group>
  );
};
