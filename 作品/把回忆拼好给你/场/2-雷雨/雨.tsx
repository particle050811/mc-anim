// 雨：照原版 1.20.1 LevelRenderer.renderSnowAndRain（javap 核过的算法）画。每一列（方块 i, j）一张一格宽的竖片，正对镜头那个方向，
// 底在那一列最高的挡雨方块顶上（heightmap MOTION_BLOCKING）；贴图 environment/rain.png（64×256）横着整张铺一格宽，竖着一格 0.25 个 v（一格 64 个贴图像素，
// 比方块细 4 倍，原版就这样）。v 是倒着贴的：片顶 v = 底·0.25 + 偏、片底 v = 顶·0.25 + 偏。
// 往下落：偏 = −((刻 + 列哈希) & 31 + 帧内) / 32 × (3 + 那一列的随机数)，列哈希、随机数的种子照原版的整数算式（Java int 溢出照抄）。
// 透明度：原版 ((1 − 距离²/半径²)·0.5 + 0.5) × 雨量；颜色乘亮度图（夜里、雷雨里很暗），这里直接给 色。
// 不受平涂的光（MeshBasicMaterial），不描边，不写深度（半透明，挡不住后面的东西）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import rainUri from 'asset:贴图/环境/雨';
import { Java随机 } from './弹坑.ts';

let 雨贴图: THREE.DataTexture | undefined;
const 取雨贴图 = () => {
  if (!雨贴图) {
    const p = png(rainUri);
    雨贴图 = new THREE.DataTexture(p.px, p.w, p.h, THREE.RGBAFormat);
    雨贴图.colorSpace = THREE.SRGBColorSpace;
    雨贴图.magFilter = THREE.NearestFilter;
    雨贴图.minFilter = THREE.NearestFilter;
    雨贴图.wrapS = THREE.RepeatWrapping;
    雨贴图.wrapT = THREE.RepeatWrapping;
    雨贴图.needsUpdate = true;
  }
  return 雨贴图;
};

/** 原版那一列的落雨偏移（v）：刻 = 游戏刻（可以带小数，整数部分是 ticks、小数部分是 partialTick） */
export const 雨偏 = (i: number, j: number, 刻: number) => {
  const ticks = Math.floor(刻);
  const pt = 刻 - ticks;
  const a = (Math.imul(Math.imul(i, i), 3121) + Math.imul(i, 45238971)) | 0;
  const b = (Math.imul(Math.imul(j, j), 418711) + Math.imul(j, 13761)) | 0;
  const 种子 = a ^ b;
  const r = new Java随机(种子).nextFloat();
  const h = (ticks + a + b) & 31;
  return (-(h + pt) / 32) * (3 + r);
};

/** 一张雨片：列 (i, j) 上、从 底 到 顶（z）的竖片。中心 [x, y]、横向半宽向量 [dx, dy]（原版 rainSizeX/Z × 0.5，正对镜头时垂直于视线）。
 *  u0、u1：这一片横着取贴图的哪一段（整列 0～1；被帽子这类东西挡住一截时切成几片，各取各的那段） */
export type 雨片 = { i: number; j: number; 中心: readonly [number, number]; 半宽: readonly [number, number]; 底: number; 顶: number; u0?: number; u1?: number; 透: number };

/** 粗：贴图放大几倍（1 = 原版，一格 64 个贴图像素）。放大以后一格只取贴图横着的 1/粗，按列错开取哪一段，竖着同样放大，落的速度（格每秒）不变 */
export const 雨: React.FC<{ 片们: readonly 雨片[]; 刻: number; 色: string; 雨量?: number; 粗?: number }> = ({ 片们, 刻, 色, 雨量 = 1, 粗 = 1 }) => {
  const geo = useMemo(() => {
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    for (const p of 片们) {
      if (p.顶 <= p.底) continue;
      const 偏 = 雨偏(p.i, p.j, 刻);
      const u0 = p.u0 ?? 0, u1 = p.u1 ?? 1;
      const 段 = (((p.i * 7 + p.j * 3) % 粗) + 粗) % 粗;
      const 贴u = (u: number) => (段 + u) / 粗;
      // 片在列里横向的位置：u 0 → 中心 − 半宽，u 1 → 中心 + 半宽
      const at = (u: number) => [p.中心[0] + (2 * u - 1) * p.半宽[0], p.中心[1] + (2 * u - 1) * p.半宽[1]];
      const [ax, ay] = at(u0);
      const [bx, by] = at(u1);
      const vTop = (p.底 * 0.25 + 偏) / 粗, vBot = (p.顶 * 0.25 + 偏) / 粗; // 偏也除：落得和原版一样快（格每秒）
      const n = pos.length / 3;
      pos.push(ax, ay, p.顶, bx, by, p.顶, bx, by, p.底, ax, ay, p.底);
      uv.push(贴u(u0), vTop, 贴u(u1), vTop, 贴u(u1), vBot, 贴u(u0), vBot);
      const a = p.透 * 雨量;
      for (let k = 0; k < 4; k++) col.push(1, 1, 1, a);
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    return g;
  }, [片们, 刻, 雨量, 粗]);
  useEffect(() => () => geo.dispose(), [geo]);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: 取雨贴图(),
        color: 色,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
      }),
    [色],
  );
  return <mesh geometry={geo} material={mat} renderOrder={10} />;
};
