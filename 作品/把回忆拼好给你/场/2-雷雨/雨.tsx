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
import { JavaRandom } from './弹坑.ts';

let rainTexture: THREE.DataTexture | undefined;
const getRainTexture = () => {
  if (!rainTexture) {
    const p = png(rainUri);
    rainTexture = new THREE.DataTexture(p.px, p.w, p.h, THREE.RGBAFormat);
    rainTexture.colorSpace = THREE.SRGBColorSpace;
    rainTexture.magFilter = THREE.NearestFilter;
    rainTexture.minFilter = THREE.NearestFilter;
    rainTexture.wrapS = THREE.RepeatWrapping;
    rainTexture.wrapT = THREE.RepeatWrapping;
    rainTexture.needsUpdate = true;
  }
  return rainTexture;
};

/** 原版那一列的落雨偏移（v）：刻 = 游戏刻（可以带小数，整数部分是 ticks、小数部分是 partialTick） */
export const rainOffset = (i: number, j: number, tick: number) => {
  const ticks = Math.floor(tick);
  const pt = tick - ticks;
  const a = (Math.imul(Math.imul(i, i), 3121) + Math.imul(i, 45238971)) | 0;
  const b = (Math.imul(Math.imul(j, j), 418711) + Math.imul(j, 13761)) | 0;
  const seed = a ^ b;
  const r = new JavaRandom(seed).nextFloat();
  const h = (ticks + a + b) & 31;
  return (-(h + pt) / 32) * (3 + r);
};

/** 一张雨片：列 (i, j) 上、从 底 到 顶（z）的竖片。中心 [x, y]、横向半宽向量 [dx, dy]（原版 rainSizeX/Z × 0.5，正对镜头时垂直于视线）。
 *  u0、u1：这一片横着取贴图的哪一段（整列 0～1；被帽子这类东西挡住一截时切成几片，各取各的那段） */
export type RainStreak = { i: number; j: number; center: readonly [number, number]; halfWidth: readonly [number, number]; bottom: number; topY: number; u0?: number; u1?: number; alpha: number };

/** 粗：贴图放大几倍（1 = 原版，一格 64 个贴图像素）。放大以后一格只取贴图横着的 1/粗，按列错开取哪一段，竖着同样放大，落的速度（格每秒）不变 */
export const Rain: React.FC<{ 片们: readonly RainStreak[]; 刻: number; 色: string; rainAmount?: number; 粗?: number }> = ({ 片们: planes, 刻: tick, 色: color, rainAmount = 1, 粗: thick = 1 }) => {
  const geo = useMemo(() => {
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    for (const p of planes) {
      if (p.topY <= p.bottom) continue;
      const uvOffset = rainOffset(p.i, p.j, tick);
      const u0 = p.u0 ?? 0, u1 = p.u1 ?? 1;
      const segIndex = (((p.i * 7 + p.j * 3) % thick) + thick) % thick;
      const atlasU = (u: number) => (segIndex + u) / thick;
      // 片在列里横向的位置：u 0 → 中心 − 半宽，u 1 → 中心 + 半宽
      const at = (u: number) => [p.center[0] + (2 * u - 1) * p.halfWidth[0], p.center[1] + (2 * u - 1) * p.halfWidth[1]];
      const [ax, ay] = at(u0);
      const [bx, by] = at(u1);
      const vTop = (p.bottom * 0.25 + uvOffset) / thick, vBot = (p.topY * 0.25 + uvOffset) / thick; // 偏也除：落得和原版一样快（格每秒）
      const n = pos.length / 3;
      pos.push(ax, ay, p.topY, bx, by, p.topY, bx, by, p.bottom, ax, ay, p.bottom);
      uv.push(atlasU(u0), vTop, atlasU(u1), vTop, atlasU(u1), vBot, atlasU(u0), vBot);
      const a = p.alpha * rainAmount;
      for (let k = 0; k < 4; k++) col.push(1, 1, 1, a);
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    return g;
  }, [planes, tick, rainAmount, thick]);
  useEffect(() => () => geo.dispose(), [geo]);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: getRainTexture(),
        color: color,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
      }),
    [color],
  );
  return <mesh geometry={geo} material={mat} renderOrder={10} />;
};
