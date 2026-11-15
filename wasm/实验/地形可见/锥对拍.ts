// 地形可见第三轮：小格子上拿随机直线对拍视线锥。40 个 22³ 的随机格子（随机实心，再挖几条直洞），
// 每个洞格朝 600 个随机方向打线，直线到得了露天格的必须都在 24 锥、细锥 2、细锥 3 的集里；
// 另查 细锥 1 = 24 锥、细锥 3 ⊆ 细锥 2 ⊆ 24 锥。用法：node wasm/实验/地形可见/锥对拍.ts
import { 锥达, 细锥达 } from './视线锥.ts';

let 种 = 12345;
const 随 = () => { 种 = (Math.imul(种, 1664525) + 1013904223) >>> 0; return (种 + 0.5) / 4294967296; };
let 总漏 = 0, 总见 = 0, 总一 = 0, 总二 = 0, 总三 = 0, 不等 = 0, 不嵌 = 0, 洞 = 0;
for (let 轮 = 0; 轮 < 40; 轮++) {
  const W = 22, nz = 22, N = W * W * nz, 实 = new Uint8Array(N), 天 = new Uint8Array(N), 密 = 0.25 + 0.4 * 随();
  // 随机实心，再挖几条随机方向的直洞和几个腔
  for (let at = 0; at < N; at++) 实[at] = 随() < 密 ? 1 : 0;
  for (let c = 0; c < 6; c++) {
    const p = [随() * W, 随() * W, 随() * nz], d = [随() - 0.5, 随() - 0.5, 随() - 0.5], r = 0.6 + 随();
    for (let t = -30; t < 30; t += 0.25) for (let e = 0; e < 4; e++) {
      const x = Math.floor(p[0] + d[0] * t + (随() - 0.5) * r), y = Math.floor(p[1] + d[1] * t + (随() - 0.5) * r), k = Math.floor(p[2] + d[2] * t + (随() - 0.5) * r);
      if (x >= 0 && y >= 0 && k >= 0 && x < W && y < W && k < nz) 实[(y * W + x) * nz + k] = 0;
    }
  }
  for (let c = 0; c < W * W; c++) for (let k = nz - 1; k >= 0 && !实[c * nz + k]; k--) 天[c * nz + k] = 1;
  const 一 = new Uint8Array(N), 一b = new Uint8Array(N), 二 = new Uint8Array(N), 三 = new Uint8Array(N), 态 = new Uint8Array(N);
  锥达(实, 天, 一, 态, W, nz); 细锥达(实, 天, 一b, W, nz, 1); 细锥达(实, 天, 二, W, nz, 2); 细锥达(实, 天, 三, W, nz, 3);
  for (let at = 0; at < N; at++) { if (一[at] !== 一b[at]) 不等++; if ((三[at] && !二[at]) || (二[at] && !一[at])) 不嵌++; }
  for (let Y = 0; Y < W; Y++) for (let X = 0; X < W; X++) for (let k = 0; k < nz; k++) {
    const at0 = (Y * W + X) * nz + k;
    if (实[at0] || 天[at0]) continue;
    洞++; 总一 += 一[at0]; 总二 += 二[at0]; 总三 += 三[at0];
    let 见 = 0;
    for (let r = 0; r < 600 && !见; r++) {
      const z = 2 * 随() - 1, 角 = 2 * Math.PI * 随(), 横 = Math.sqrt(1 - z * z), d = [横 * Math.cos(角), 横 * Math.sin(角), z];
      const p = [X, Y, k], 向 = d.map(Math.sign), 隔 = d.map((v) => (v ? 1 / Math.abs(v) : Infinity)), 到 = d.map((v) => { const o = 随(); return v > 0 ? (1 - o) / v : v < 0 ? o / -v : Infinity; });
      for (;;) {
        const t = 到[0] <= 到[1] && 到[0] <= 到[2] ? 0 : 到[1] <= 到[2] ? 1 : 2;
        p[t] += 向[t]; 到[t] += 隔[t];
        if (p[2] >= nz) { 见 = 1; break; }
        if (p[0] < 0 || p[1] < 0 || p[0] >= W || p[1] >= W || p[2] < 0) break;
        const at = (p[1] * W + p[0]) * nz + p[2];
        if (实[at]) break;
        if (天[at]) { 见 = 1; break; }
      }
    }
    if (见) { 总见++; if (!一[at0] || !二[at0] || !三[at0]) 总漏++; }
  }
}
console.log(JSON.stringify({ 洞格: 洞, 随机直线看得到: 总见, 在24锥里: 总一, 在细锥2里: 总二, 在细锥3里: 总三, 直线看得到却不在集里: 总漏, 细锥1和24锥不一样的格: 不等, 不嵌套的格: 不嵌 }));
