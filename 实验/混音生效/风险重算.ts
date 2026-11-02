// 只读段定义，不渲染；同起点组用闭区间 [首下标, 末下标]，下标从 0 开始。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { 全部段 } from '../../pipeline/清单/清单.ts';
const rows = [];
for (const s of await 全部段()) {
  const starts = (s.段.声音 ?? []).map(c => Math.max(0, c.帧)).sort((a, b) => a - b);
  const groups = [];
  for (let i = 0; i < starts.length;) {
    let end = i + 1;
    while (end < starts.length && starts[end] === starts[i]) end++;
    if (end - i > 1) groups.push({ 帧: starts[i], 条数: end - i, 首下标: i, 末下标: end - 1, 跨界: Math.floor(i / 10) !== Math.floor((end - 1) / 10) });
    i = end;
  }
  rows.push({ 段: s.键, 声音条数: starts.length, 同起点组数: groups.length, 单组最多: Math.max(0, ...groups.map(g => g.条数)), 第一层跨界组数: groups.filter(g => g.跨界).length, 同起点组: groups });
}
fs.writeFileSync(new URL('./风险重算.json', import.meta.url), JSON.stringify(rows, null, 2) + '\n');
const risk = rows.filter(r => r.声音条数 > 10 && r.第一层跨界组数 > 0);
console.log('| 段 | 声音条数 | 同起点组数 | 单组最多 | 第一层跨界组数 |');
console.log('|---|---:|---:|---:|---:|');
for (const r of risk) console.log(`| ${r.段} | ${r.声音条数} | ${r.同起点组数} | ${r.单组最多} | ${r.第一层跨界组数} |`);
// 已留存的真实清单只用于核对穿塔，不把静态推断冒充新渲染证据。
const list = JSON.parse(fs.readFileSync(new URL('../混音生效/c-打乱后清单.json', import.meta.url), 'utf8'));
const actual = [];
for (let k = 10; k < list.length; k += 10) if (list[k - 1].start === list[k].start) actual.push(k);
const tower = rows.find(r => r.段 === '6-穿塔斩首领')!;
const predicted = tower.同起点组.flatMap(g => Array.from({length: Math.floor(g.末下标 / 10) - Math.floor(g.首下标 / 10)}, (_, j) => (Math.floor(g.首下标 / 10) + j + 1) * 10));
assert.deepEqual(predicted, actual);
console.log(`穿塔静态与已存真实清单的跨界下标完全相同：${actual.join(', ')}（${actual.length} 个边界）`);
console.log(`扫描 ${rows.length} 段；风险 ${risk.length} 段。`);
