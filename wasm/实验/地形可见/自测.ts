// 变换的小自测（不读包）：用户 11-14 点名要防的三种误伤各造一个最小的例子。  node wasm/实验/地形可见/自测.ts
//   只从侧面连通的洞、连通口只有 1 格的洞不许填；碰到核心的边就当连通不填；洞壁、崖壁（贴着露天格的整格）不许换。
import assert from 'node:assert/strict';
import { 边, 列数, type 格子 } from './公共.ts';
import { 埋格换石, 填封闭腔 } from './变换.ts';

const nz = 40, 顶 = 30; // 实心到 k = 29，上面是空气
const 空 = 0, 石 = 1, 土 = 2, 水 = 3;
const 造 = (): 格子 => {
  const cm = new Uint16Array(列数 * nz);
  for (let c = 0; c < 列数; c++) cm.fill(土, c * nz, c * nz + 顶);
  return { id: { L: 0, i: 0, j: 0 }, kBottom: 0, nz, cm, 色板: [0, 65535, 1, 65535, 2, 65535, 3, 65535], 满: Uint8Array.of(0, 1, 1, 0), 石 };
};
const at = (x: number, y: number, k: number) => (y * 边 + x) * nz + k;
const 挖 = (g: 格子, x0: number, y0: number, k0: number, x1: number, y1: number, k1: number, v = 空) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let k = k0; k <= k1; k++) g.cm[at(x, y, k)] = v; };
const 洞 = (g: 格子, v = 空) => 挖(g, 15, 15, 10, 17, 17, 12, v); // 3×3×3 的腔，顶上还有 17 格土

{ // 封死的腔：填；水腔一样
  const g = 造(); 洞(g);
  assert.equal(填封闭腔(g).length, 27);
  const w = 造(); 洞(w, 水);
  assert.equal(填封闭腔(w).length, 27);
}
{ // 腔往东横着一条 1 格的洞，再拐上去 1 格见方通到地面：不填
  const g = 造(); 洞(g); 挖(g, 18, 16, 11, 25, 16, 11); 挖(g, 25, 16, 12, 25, 16, 顶 - 1);
  assert.equal(填封闭腔(g).length, 0);
}
{ // 崖下的凹洞：x ≥ 20 整片低到 k = 12（崖），腔从崖面上一个 1 格见方的口横着通出去（口只有 1 格高）：不填；洞壁和崖壁不换
  const g = 造(); 洞(g); 挖(g, 20, 0, 12, 边 - 1, 边 - 1, 顶 - 1); 挖(g, 18, 16, 12, 19, 16, 12);
  assert.equal(填封闭腔(g).length, 0);
  埋格换石(g);
  for (const [x, y, k] of [[14, 16, 11], [16, 16, 9], [16, 16, 13], [19, 10, 20], [19, 16, 13], [22, 10, 11]]) assert.equal(g.cm[at(x!, y!, k!)], 土, `贴着露天的 ${x},${y},${k} 被换了`);
  assert.equal(g.cm[at(10, 10, 5)], 石); // 四面都埋着的照换
}
{ // 腔只经一条 1 格的洞横着通到核心的边（第 1 列）：窗口外不知道，当连通，不填
  const g = 造(); 洞(g); 挖(g, 1, 16, 11, 14, 16, 11);
  assert.equal(填封闭腔(g).length, 0);
  const h = 造(); 洞(h); 挖(h, 2, 16, 11, 14, 16, 11); // 差一格没到边：封死的，填
  assert.equal(填封闭腔(h).length, 27 + 13);
}
{ // 水连着水也算连通：腔里是水，经一条水道通到地面的湖，不填
  const g = 造(); 洞(g, 水); 挖(g, 16, 16, 13, 16, 16, 顶 - 1, 水);
  assert.equal(填封闭腔(g).length, 0);
}
{ // 埋格换石不动核心的边和相邻那圈、不动最上一层、不动贴着腔的格，换完不透明性不变
  const g = 造(); 洞(g);
  const 前 = g.cm.slice(), n = 埋格换石(g);
  assert.ok(n > 0);
  for (let i = 0; i < g.cm.length; i++) {
    const c = Math.floor(i / nz), k = i % nz, x = c % 边, y = (c - x) / 边;
    assert.equal(g.满[g.cm[i]!], g.满[前[i]!]);
    if (x < 2 || y < 2 || x > 边 - 3 || y > 边 - 3 || k >= 顶 - 1) assert.equal(g.cm[i], 前[i]);
  }
  for (const [x, y, k] of [[14, 15, 10], [18, 17, 12], [16, 16, 13], [16, 16, 9]]) assert.equal(g.cm[at(x!, y!, k!)], 土);
  assert.equal(g.cm[at(14, 14, 9)], 石); // 只沿棱、角挨着腔的不算贴着（网格取环境光遮蔽只看整格不透明，换成石头不变）
}
console.log('自测过');
