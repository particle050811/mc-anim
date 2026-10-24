// 窗光的画法：光斑.ts 算出的光斑（南窗、天亮时的卧室门）画成贴在受光面上的薄片，乘到底下已经画好的颜色上：结果 = 底色 × (1 + 色)（混合 DstColor·源 + 1·目标），
// 光斑里的木纹、被子花纹照旧看得见，只是亮一截、偏光的颜色。一遍最多乘 2（源色到 1 就封顶），要更亮就同一片叠几遍，每遍乘 倍^(1/遍数)。
// 薄片不写深度、透明：床、她挡在前面的地方照样挡住；描边的遮罩里也不画它（engine/三渲二/描边.tsx 跳过透明不写深度的）。
// 平涂把 MeshBasicMaterial 当不受光的，不乘色调、面明暗，乘多少就是给的数（sRGB 数值上乘）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { type 光条, type 受光面, 卧室光斑, type 卧室开口 } from './光斑.ts';

/** 薄片离受光面多远（格）：盖过面、又不碰到前面的东西。她坐在床沿时裙摆斜着插进被面，插进去那条线上离面这么高的一截裙子也被乘亮，
 *  0.004 时裙边透出一道亮线；正交机位深度是线性的，0.001 也不和被面抢深度 */
const 离面 = 0.001;

const 几何 = (片们: readonly { 面: 受光面; 条: 光条[] }[]) => {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const { 面, 条 } of 片们)
    for (const c of 条) {
      const b = pos.length / 3;
      if (面.种 === '竖') {
        const y = 面.y - 离面;
        pos.push(c.a0, y, c.b0, c.a1, y, c.b0, c.a1, y, c.b1, c.a0, y, c.b1);
      } else {
        const z = 面.z + 离面;
        pos.push(c.a0, c.b0, z, c.a1, c.b0, z, c.a1, c.b1, z, c.a0, c.b1, z);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
};

/** 一束光（从、方向、倍见 参数.ts 的 窗光档们）：倍 = 光斑里的颜色乘多少（r、g、b，sRGB 数值，≥ 1） */
export const 窗光: React.FC<{ 从?: keyof typeof 卧室开口; 方向: readonly number[]; 倍: readonly number[] }> = ({ 从 = '南窗', 方向, 倍 }) => {
  const g = useMemo(() => 几何(卧室光斑(方向, 从)), [从, 方向[0], 方向[1], 方向[2]]);
  const ms = useMemo(() => {
    const 遍数 = Math.max(1, Math.ceil(Math.log2(Math.max(...倍)) - 1e-9));
    const 每遍 = 倍.map((k) => Math.pow(k, 1 / 遍数) - 1);
    return Array.from(
      { length: 遍数 },
      () =>
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setRGB(每遍[0]!, 每遍[1]!, 每遍[2]!, THREE.SRGBColorSpace),
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.CustomBlending,
          blendEquation: THREE.AddEquation,
          blendSrc: THREE.DstColorFactor,
          blendDst: THREE.OneFactor,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
    );
  }, [倍[0], 倍[1], 倍[2]]);
  return (
    <>
      {ms.map((m, i) => (
        <mesh key={i} geometry={g} material={m} renderOrder={1 + i} />
      ))}
    </>
  );
};
