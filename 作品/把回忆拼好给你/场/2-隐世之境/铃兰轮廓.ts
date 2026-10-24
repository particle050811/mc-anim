// 月铃兰的外轮廓（铃兰.tsx 画）：把物品贴图的镂空填平取外形，往外扩一圈，扩出来的那圈就是外轮廓；镂空里不出线。纯函数，测试核。
// 贴图细分成 细分 × 细分 个小格再扩（轮廓比一个贴图像素细），四周留 边 个贴图像素给轮廓伸出去。

/** 不透明 = alpha > 0（同 engine/model/物品贴图.tsx 挤出时的判断） */
const 实 = (px: Uint8Array, i: number) => px[i * 4 + 3]! > 0;

/** 填平镂空：从四边往里走透明像素，走不到的透明像素（四周被围住的洞）算实的。返回 w × h 的 0/1 */
export const 填洞 = (px: Uint8Array, w: number, h: number): Uint8Array => {
  const 外 = new Uint8Array(w * h);
  const 栈: number[] = [];
  const 推 = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (外[i] || 实(px, i)) return;
    外[i] = 1;
    栈.push(i);
  };
  for (let x = 0; x < w; x++) (推(x, 0), 推(x, h - 1));
  for (let y = 0; y < h; y++) (推(0, y), 推(w - 1, y));
  while (栈.length) {
    const i = 栈.pop()!;
    const [x, y] = [i % w, Math.floor(i / w)];
    推(x + 1, y), 推(x - 1, y), 推(x, y + 1), 推(x, y - 1);
  }
  return Uint8Array.from(外, (v) => (v ? 0 : 1));
};

/** 外轮廓：宽 (w + 2·边)·细分、高 (h + 2·边)·细分 的 0/1（行优先，第一行在上）：填平后的外形往外扩 宽 个小格（方形扩，横平竖直），去掉外形本身 */
export const 外轮廓 = (px: Uint8Array, w: number, h: number, 细分: number, 宽: number, 边: number) => {
  const 形 = 填洞(px, w, h);
  const W = (w + 2 * 边) * 细分;
  const H = (h + 2 * 边) * 细分;
  const 在形 = (X: number, Y: number) => {
    const x = Math.floor(X / 细分) - 边;
    const y = Math.floor(Y / 细分) - 边;
    return x >= 0 && y >= 0 && x < w && y < h && 形[y * w + x] === 1;
  };
  const 环 = new Uint8Array(W * H);
  for (let Y = 0; Y < H; Y++)
    for (let X = 0; X < W; X++) {
      if (在形(X, Y)) continue;
      let 近 = false;
      for (let dy = -宽; dy <= 宽 && !近; dy++) for (let dx = -宽; dx <= 宽 && !近; dx++) 近 = 在形(X + dx, Y + dy);
      环[Y * W + X] = 近 ? 1 : 0;
    }
  return { 宽: W, 高: H, 环 };
};
