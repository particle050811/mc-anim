// 地形可见第三轮：视线的保守集（真可见集的超集）。视线.ts 和 锥对拍.ts 共用，都返回耗时毫秒。
// 格子按 (Y*W + X)*nz + k 排；实 = 整格不透明，源 = 镜头位置，出 = 到得了的格（只写 1，不清）。
// 依据：直线穿过的格是六邻相连、三轴各不回头的一串；取分量最大的轴当主轴，主轴每走一步另两轴各至多一步。
/** 24 个锥：主轴 a 每走一步，另两轴各至多走一步。态的位：1 = 另两轴都没走过，2 = 第一个走过，4 = 第二个走过，8 = 都走过 */
export const 锥达 = (实: Uint8Array, 源: Uint8Array, 出: Uint8Array, 态: Uint8Array, W: number, nz: number) => {
  const t1 = performance.now(), 行 = W * nz;
  for (let a = 0; a < 3; a++) for (let o = 0; o < 8; o++) {
    const sX = o & 1 ? 1 : -1, sY = o & 2 ? 1 : -1, sK = o & 4 ? 1 : -1;
    for (let yi = 0; yi < W; yi++) for (let xi = 0; xi < W; xi++) {
      const Y = sY > 0 ? yi : W - 1 - yi, X = sX > 0 ? xi : W - 1 - xi, base = (Y * W + X) * nz;
      const pX = xi > 0 ? base - sX * nz : -1, pY = yi > 0 ? base - sY * 行 : -1;
      for (let ki = 0; ki < nz; ki++) {
        const k = sK > 0 ? ki : nz - 1 - ki, at = base + k;
        if (实[at]) { 态[at] = 0; continue; }
        const mx = pX >= 0 ? 态[pX + k]! : 0, my = pY >= 0 ? 态[pY + k]! : 0, mk = ki > 0 ? 态[at - sK]! : 0;
        const ma = a === 0 ? mx : a === 1 ? my : mk, mb = a === 0 ? my : mx, mc = a === 2 ? my : mk;
        let v = 源[at] || ma ? 1 : 0;
        if (!v) v = (mb & 1 ? 2 : 0) | (mb & 4 ? 8 : 0) | (mc & 1 ? 4 : 0) | (mc & 2 ? 8 : 0);
        态[at] = v;
        if (v) 出[at] = 1;
      }
    }
  }
  return Math.round(performance.now() - t1);
};
/** 更细的锥：两个副轴各记「上次自己走完以后主轴走了几步」（0..K，封顶），按斜率分 K 档各扫一遍。镜头位置的线从哪一步开始都行，所以源格什么状态都有 */
export const 细锥达 = (实: Uint8Array, 源: Uint8Array, 出: Uint8Array, W: number, nz: number, K: number) => {
  const t1 = performance.now(), 行 = W * nz, C = K + 1, 全 = 2 ** (C * C) - 1, 态 = new Uint16Array(实.length);
  // 第 t 档：主轴步要求计数 ≤ 上，副轴步要求计数 ≥ 下
  const 上 = (t: number) => (t < K - 1 ? t + 1 : K), 下 = (t: number) => (t < K - 1 ? t + 1 : K);
  for (let tb = 0; tb < K; tb++) for (let tc = 0; tc < K; tc++) {
    const Ta = new Uint16Array(全 + 1), Tb = new Uint16Array(全 + 1), Tc = new Uint16Array(全 + 1);
    for (let m = 1; m <= 全; m++) {
      let va = 0, vb = 0, vc = 0;
      for (let cb = 0; cb < C; cb++) for (let cc = 0; cc < C; cc++) {
        if (!(m & (1 << (cb * C + cc)))) continue;
        if (cb <= 上(tb) && cc <= 上(tc)) va |= 1 << (Math.min(cb + 1, K) * C + Math.min(cc + 1, K));
        if (cb >= 下(tb)) vb |= 1 << cc;
        if (cc >= 下(tc)) vc |= 1 << (cb * C);
      }
      Ta[m] = va; Tb[m] = vb; Tc[m] = vc;
    }
    for (let a = 0; a < 3; a++) for (let o = 0; o < 8; o++) {
      const sX = o & 1 ? 1 : -1, sY = o & 2 ? 1 : -1, sK = o & 4 ? 1 : -1;
      for (let yi = 0; yi < W; yi++) for (let xi = 0; xi < W; xi++) {
        const Y = sY > 0 ? yi : W - 1 - yi, X = sX > 0 ? xi : W - 1 - xi, base = (Y * W + X) * nz;
        const pX = xi > 0 ? base - sX * nz : -1, pY = yi > 0 ? base - sY * 行 : -1;
        for (let ki = 0; ki < nz; ki++) {
          const k = sK > 0 ? ki : nz - 1 - ki, at = base + k;
          if (实[at]) { 态[at] = 0; continue; }
          if (源[at]) { 态[at] = 全; 出[at] = 1; continue; }
          const mx = pX >= 0 ? 态[pX + k]! : 0, my = pY >= 0 ? 态[pY + k]! : 0, mk = ki > 0 ? 态[at - sK]! : 0;
          const v = Ta[a === 0 ? mx : a === 1 ? my : mk]! | Tb[a === 0 ? my : mx]! | Tc[a === 2 ? my : mk]!;
          态[at] = v;
          if (v) 出[at] = 1;
        }
      }
    }
  }
  return Math.round(performance.now() - t1);
};
