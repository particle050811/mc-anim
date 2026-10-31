// 用法：node 读桩.mjs <桩.log> [--跳 n]：按帧把 @桩 行相加，报每个键的中位、均值；再报 GPU 段（@桩事件 gpu）。归因实验用，不合并。
import fs from 'node:fs';
const f = process.argv[2];
const 跳i = process.argv.indexOf('--跳');
const 跳 = 跳i > 0 ? Number(process.argv[跳i + 1]) : 1;
const 帧 = new Map();
const gpu = new Map();
const 事件 = new Map();
for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
  if (l.startsWith('@桩事件 ')) {
    const e = JSON.parse(l.slice(5));
    if (e.类 === 'gpu') { const k = e.数据.f; if (!gpu.has(k)) gpu.set(k, {}); const m = gpu.get(k); m[e.数据.名] = (m[e.数据.名] ?? 0) + e.数据.ms; }
    else { 事件.set(e.类, (事件.get(e.类) ?? []).concat([e.数据])); }
  } else if (l.startsWith('@桩 ')) {
    const o = JSON.parse(l.slice(3));
    const m = 帧.get(o.f) ?? {};
    for (const [k, v] of Object.entries(o)) if (k !== 'f' && k !== 't') m[k] = (m[k] ?? 0) + v;
    帧.set(o.f, m);
  }
}
const 帧号 = [...帧.keys()].filter((x) => x >= 0).sort((a, b) => a - b).slice(跳);
const 键 = new Set(帧号.flatMap((x) => Object.keys(帧.get(x))));
const 中 = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
console.log(`帧 ${帧号[0]}～${帧号.at(-1)}，共 ${帧号.length} 帧（跳过开头 ${跳} 帧）`);
const 行 = [...键].sort().map((k) => { const a = 帧号.map((x) => 帧.get(x)[k] ?? 0); return [k, 中(a), a.reduce((p, q) => p + q, 0) / a.length, Math.max(...a)]; });
console.log('键'.padEnd(44), '中位'.padStart(12), '均值'.padStart(12), '最大'.padStart(12));
for (const [k, m, a, x] of 行) console.log(String(k).padEnd(44), m.toFixed(2).padStart(12), a.toFixed(2).padStart(12), x.toFixed(2).padStart(12));
if (gpu.size) {
  const g帧 = 帧号.filter((x) => gpu.has(x));
  const g键 = new Set(g帧.flatMap((x) => Object.keys(gpu.get(x))));
  console.log(`\nGPU 按帧缓冲（毫秒/帧，${g帧.length} 帧）`);
  let tot = [];
  for (const k of g键) { const a = g帧.map((x) => gpu.get(x)[k] ?? 0); console.log(k.padEnd(20), '中位', 中(a).toFixed(2).padStart(9), '均值', (a.reduce((p, q) => p + q, 0) / a.length).toFixed(2).padStart(9)); }
  tot = g帧.map((x) => Object.values(gpu.get(x)).reduce((p, q) => p + q, 0));
  console.log('合计'.padEnd(20), '中位', 中(tot).toFixed(2).padStart(9), '均值', (tot.reduce((p, q) => p + q, 0) / tot.length).toFixed(2).padStart(9));
}
for (const [k, v] of 事件) console.log(`事件 ${k}: ${v.length} 次；前 3：${JSON.stringify(v.slice(0, 3))}`);
