// 用法：node 读配置.mjs <x.cpuprofile> [帧数]：self time 排行、每遍的包含时间和分解。归因实验用，不合并。
import fs from 'node:fs';
const [f, 帧数参] = process.argv.slice(2);
const pf = JSON.parse(fs.readFileSync(f, 'utf8'));
const 帧数 = Number(帧数参 ?? JSON.parse(fs.readFileSync(f.replace('.cpuprofile', '.帧.json'))).帧数);
const nodes = new Map(pf.nodes.map((n) => [n.id, { ...n, self: 0, kids: [] }]));
for (const n of nodes.values()) for (const k of n.children ?? []) { const c = nodes.get(k); c.parent = n; n.kids.push(c); }
pf.samples.forEach((id, i) => { nodes.get(id).self += (pf.timeDeltas[i] ?? 0) / 1000; });
const 总 = [...nodes.values()].reduce((a, n) => a + n.self, 0);
const name = (n) => n.callFrame.functionName || `(匿名 ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber})`;
const 全名 = (n) => `${name(n)} [${n.callFrame.url.split('/').pop().slice(0, 18)}:${n.callFrame.lineNumber}]`;
const inc = (n) => (n._inc ??= n.self + n.kids.reduce((a, c) => a + inc(c), 0));
const 行 = (a, w = 56) => a.padEnd(w);
const ms = (x) => (x / 帧数).toFixed(2).padStart(8);
console.log(`总采样 ${(总 / 1000).toFixed(2)} 秒，帧数 ${帧数}，每帧 ${(总 / 帧数).toFixed(1)} ms，采样 ${pf.samples.length} 个`);
// self 排行
const 累 = (filter, key) => {
  const m = new Map();
  for (const n of nodes.values()) { if (filter && !filter(n)) continue; const k = key(n); m.set(k, (m.get(k) ?? 0) + n.self); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
console.log('\n== 全页面 self time 前 25（毫秒/帧）');
for (const [k, v] of 累(null, 全名).slice(0, 25)) console.log(行(k, 62), ms(v));
// 祖先里有某函数
const 祖先有 = (n, re) => { for (let x = n; x; x = x.parent) if (re.test(x.callFrame.functionName)) return x; return null; };
const AO = /^AO第|^AO水面|^AO收集/;
console.log('\n== 按遍的包含时间（毫秒/帧）');
const 遍 = new Map();
for (const n of nodes.values()) { if (AO.test(n.callFrame.functionName) && !祖先有(n.parent, AO)) 遍.set(n.callFrame.functionName, (遍.get(n.callFrame.functionName) ?? 0) + inc(n)); }
for (const [k, v] of [...遍.entries()].sort()) console.log(行(k), ms(v));
// useFrame 总
const 顶层累 = (re) => { let s = 0; for (const n of nodes.values()) if (re.test(n.callFrame.functionName) && !祖先有(n.parent, re)) s += inc(n); return s; };
for (const nm of ['advance', 'update', 'render', 'useFrame', 'seekToFrame', 'remotion_setFrame', 'commitRoot', 'performWorkOnRoot', 'projectObject', 'renderScene', 'renderObjects', 'renderObject', 'renderBufferDirect', 'setProgram', 'updateMatrixWorld', 'sort', 'finish', 'getProgram', 'intersectsFrustum', 'intersectsObject', 'shadowOnlyFrustumTest', 'traverse', 'pickDirs', 'addGroup', 'clearGroups', 'VoxelWorld', 'pickSections', 'readPixels', 'bufferData', 'drawElements', 'uniformMatrix4fv', 'bindVertexArray', 'bindBuffer'])
  console.log(行(`顶层包含 ${nm}`), ms(顶层累(new RegExp(`(^|\\.)${nm}$`))));
// 每遍分解
const 子分解 = (根re, 深 = 3) => {
  const m = new Map();
  for (const n of nodes.values()) {
    if (!n.self) continue;
    const 根 = 祖先有(n, 根re);
    if (!根) continue;
    // 路径上归到关键函数
    let 类 = '其它';
    for (let x = n; x && x !== 根.parent; x = x.parent) {
      const fn = x.callFrame.functionName;
      if (['projectObject', 'updateMatrixWorld', 'renderObject', 'sort'].includes(fn) || /shadowMap|WebGLShadowMap/.test(fn)) { 类 = fn; }
    }
    m.set(`${类}`, (m.get(类) ?? 0) + n.self);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
for (const 遍名 of 遍.keys()) {
  const re = new RegExp(`^${遍名}$`);
  console.log(`\n== ${遍名}：self 前 15（毫秒/帧）`);
  for (const [k, v] of 累((n) => 祖先有(n, re), 全名).slice(0, 15)) console.log(行(k, 62), ms(v));
}
// 第1遍里阴影占多少：按调用路径第一层孩子打印，到三层
const 打树 = (n, 深, 阈) => {
  if (inc(n) / 帧数 < 阈) return;
  console.log(' '.repeat(深 * 2) + name(n).padEnd(50 - 深 * 2), ms(inc(n)), ms(n.self));
  for (const c of [...n.kids].sort((a, b) => inc(b) - inc(a))) if (深 < 9) 打树(c, 深 + 1, 阈);
};
for (const 遍名 of ['AO第1遍投影加不透明', 'AO第3遍半透明', 'AO水面遍']) {
  console.log(`\n== 调用树 ${遍名}（包含、self，≥1.5 毫秒/帧）`);
  for (const n of nodes.values()) if (n.callFrame.functionName === 遍名 && !祖先有(n.parent, AO)) 打树(n, 0, 1.5);
}
