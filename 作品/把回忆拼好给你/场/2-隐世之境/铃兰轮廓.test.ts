import { describe, expect, it } from 'vitest';
import { 外轮廓, 填洞 } from './铃兰轮廓.ts';

// 5×5 的小图：一圈实心围住正中一个洞，右下角外面再挂一个点
const 图 = (实们: [number, number][], w = 5, h = 5) => {
  const px = new Uint8Array(w * h * 4);
  for (const [x, y] of 实们) px[(y * w + x) * 4 + 3] = 255;
  return px;
};
const 环形: [number, number][] = [
  [1, 1], [2, 1], [3, 1],
  [1, 2], [3, 2],
  [1, 3], [2, 3], [3, 3],
];

describe('月铃兰外轮廓', () => {
  it('填洞：围住的洞算实的，碰到四边的透明不算', () => {
    const 形 = 填洞(图(环形), 5, 5);
    expect(形[2 * 5 + 2]).toBe(1);
    expect(形[0]).toBe(0);
    expect(形[4 * 5 + 4]).toBe(0);
  });

  it('外轮廓只在外形外面一圈：洞里不出线，外形本身不涂，扩出去的宽度对', () => {
    const { 宽: W, 高: H, 环 } = 外轮廓(图(环形), 5, 5, 4, 1, 1);
    expect([W, H]).toEqual([28, 28]);
    const 在 = (X: number, Y: number) => 环[Y * W + X];
    // 洞（贴图格 (2,2)，细分后 X、Y 在 (2+1)*4 … +3）
    for (let d = 0; d < 4; d++) expect(在(12 + d, 12 + d)).toBe(0);
    // 外形左上角那格是 (1,1) → 小格 8…11；它左边一小格是轮廓，再往左不是
    expect(在(8, 8)).toBe(0);
    expect(在(7, 8)).toBe(1);
    expect(在(6, 8)).toBe(0);
  });
});
