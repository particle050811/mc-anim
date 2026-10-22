// 说话的嘴：按口型（口型.ts）在脸上画一张动画式的嘴，九胡、李樱共用，各自给尺寸、颜色（见 九胡.tsx、李樱.tsx）。
// 形状：上沿平、下沿圆；圆口型（o、u）上沿也收圆；张大了底下露出舌头。说话中闭嘴时是一道线。
// 按脸的格子（cell）一格格铺，边缘带一点像素感、不是一块方形（用户 10-15 照参考视频定）。
// 几何在 XY 平面、正面朝 +Z，原点是嘴的上沿中点，往 −Y 张；挂到脸上时各自转过去。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { Mouth } from './口型.ts';

export type MouthSpec = {
  cell: number; // 一格多大（像素）
  w: number; // 平常嘴宽
  h: number; // 张到最大时的高
  closedW: number; // 闭嘴那道线的宽
  closedH: number; // 闭嘴那道线的高
  colors: { lip: THREE.ColorRepresentation; inside: THREE.ColorRepresentation; tongue: THREE.ColorRepresentation };
};

type Cell = { x: number; y: number; color: 'lip' | 'inside' | 'tongue' };

// x 从中线往两边量，y 从上沿往下量（都按格）
const mouthCells = (mouth: Mouth, spec: MouthSpec): Cell[] => {
  const cells: Cell[] = [];
  const closedRows = Math.max(1, Math.round(spec.closedH / spec.cell));
  // 一张开就比闭嘴那道线高：不然微张、嘟嘴这些小口型在线比较粗的脸上（李樱）看着还是一道线
  const h = Math.round((spec.closedH + (spec.h - spec.closedH) * mouth.open) / spec.cell);
  if (mouth.open < 0.08 || h <= closedRows) {
    const half = Math.round(spec.closedW / spec.cell / 2);
    for (let y = 0; y < closedRows; y++) for (let x = -half; x < half; x++) cells.push({ x, y, color: 'lip' });
    return cells;
  }
  const half = (spec.w * mouth.width) / spec.cell / 2;
  const round = Math.min(1, Math.max(0, (1 - mouth.width) / 0.45)); // 嘟嘴 1，圆嘴一半，其余 0
  const topH = h * 0.4 * round; // 上沿收圆的那段高
  for (let y = 0; y < h; y++) {
    const yc = y + 0.5;
    const k = yc < topH ? 1 - ((topH - yc) / topH) ** 2 : 1 - ((yc - topH) / (h - topH)) ** 2; // 椭圆的上、下两半
    const w = Math.round(half * Math.sqrt(Math.max(0, k)));
    const tongue = h >= 5 && yc > h * 0.62;
    for (let x = -w; x < w; x++) cells.push({ x, y, color: tongue && Math.abs(x + 0.5) < w * 0.7 ? 'tongue' : 'inside' });
  }
  return cells;
};

export const TalkingMouth: React.FC<{ mouth: Mouth; spec: MouthSpec }> = ({ mouth, spec }) => {
  const cells = mouthCells(mouth, spec);
  const key = cells.map((c) => `${c.x},${c.y},${c.color}`).join(';');
  const geo = useMemo(() => {
    const colors = { lip: new THREE.Color(spec.colors.lip), inside: new THREE.Color(spec.colors.inside), tongue: new THREE.Color(spec.colors.tongue) };
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    for (const c of cells) {
      const color = colors[c.color];
      const x0 = c.x * spec.cell;
      const y0 = -(c.y + 1) * spec.cell;
      const base = pos.length / 3;
      pos.push(x0, y0, 0, x0 + spec.cell, y0, 0, x0 + spec.cell, y0 + spec.cell, 0, x0, y0 + spec.cell, 0); // 从 +Z 看逆时针
      for (let i = 0; i < 4; i++) col.push(color.r, color.g, color.b);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, spec]);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.9} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-8} />
    </mesh>
  );
};
