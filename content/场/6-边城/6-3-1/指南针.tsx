// 6-3-1 九胡右手里的结构指南针（模型/物品/结构指南针.tsx，指针会转），位置、朝向、指针角度由 编排.ts 的 `compass` 给出。
import React from 'react';
import { StructureCompass } from '../../../../world/物品/结构指南针.tsx';
import { compassScale, type CompassState } from './编排.ts';

export const HeldCompass: React.FC<{ s: CompassState }> = ({ s: state }) => (
  <group position={state.pos} quaternion={state.quat}>
    <group scale={compassScale}>
      <StructureCompass needle={state.needle} />
    </group>
  </group>
);
