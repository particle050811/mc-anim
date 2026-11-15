// 变换 4：把相邻 2×2 个区段拼成一个 64×64 的区段（带一圈相邻格是 66×66 列）再编码，只量体积，不改格式；解码耗时在 解宽.ts 量。
//   node wasm/实验/地形可见/拼大.ts <包名> [--每级 <最多几组，默认 40>] [--保真 <清单>] > 结果.json
// 组从留出集里挑：留出的区段所在的 2×2（i>>1、j>>1），四个都在包里、都不在保真清单里才算。
// 拼法：每列取它是核心的那个区段的抄本；四个区段各自的 k底 不一样，拼出来从最低的 k底 起，各列自己 k底 以下填石头（现在本来就不存、当实心）、顶上填空气。
//   真烘 64×64 时这一截存的是真方块（多半也是埋住的），所以这里略偏乐观。
// 「拼后再做」= 在 66 列的窗口上再做一遍 3、1：原来四个区段之间的边不再是核心的边，裙边那两列也能动了。
// 编码器在 宽编码.ts（每边列数做成参数）；每组先用 34 列压一个原区段，和正式编码器逐字节相同才往下算。
import fs from 'node:fs';
import { 压区段 } from '../../../pipeline/世界/烘焙/区段编码.ts';
import { 载入, 开包, 留出集, 成格子, 抄, 成区段, 键, terrain根, 边, type 区段项 } from './公共.ts';
import { 埋格换石, 填封闭腔 } from '../../../pipeline/世界/烘焙/可见.ts';
import { 压宽, 排色板, 拼 } from './宽编码.ts';

const 参 = process.argv.slice(2), 包名 = 参[0]!;
const 取参 = (名: string) => { const i = 参.indexOf(名); return i < 0 ? undefined : 参[i + 1]; };
const 每级 = Number(取参('--每级') ?? 40);
const 环 = await 载入(), 包 = 开包(环, terrain根(), 包名);
const 全包级字节 = 包.级.map((b) => b.reduce((s, x) => s + x.len, 0));
const 保真文件 = 取参('--保真'), 保真 = new Set(保真文件 ? fs.readFileSync(保真文件, 'utf8').split('\n').filter(Boolean) : []);
const 列 = ['四个原样', '拼原样', '四个1+3', '拼1+3', '拼后再做1+3'] as const;
const 统 = Array.from({ length: 7 }, () => ({ 组: 0, ...(Object.fromEntries(列.map((k) => [k, 0])) as Record<(typeof 列)[number], number>) }));
const 见 = new Set<string>();
let 抄本不同 = 0;
for (const s of 留出集(包).测) {
  const { L } = s.id, a = s.id.i >> 1, b = s.id.j >> 1, 组键 = `${L}/${a}/${b}`, st = 统[L]!;
  if (见.has(组键) || st.组 >= 每级) continue;
  见.add(组键);
  const 项 = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([di, dj]) => 包.查.get(键({ L, i: 2 * a + di!, j: 2 * b + dj! })));
  if (项.some((x) => !x || 保真.has(键(x.id)))) continue;
  const 原 = (项 as 区段项[]).map((x) => 成格子(包, 包.解(x)));
  // 抄的编码器先对一下：34 列压第一个区段，要和正式编码器逐字节相同
  const d0 = 成区段(原[0]!), 正式 = 压区段(d0, 包.模型), 抄的 = 压宽({ ...原[0]!, cm: 排色板(原[0]!).cm, 色板: Array.from(d0.palette) }, L, 包.模型);
  if (Buffer.compare(正式, 抄的)) throw new Error(`抄的编码器和正式的不一样：${键(原[0]!.id)}`);
  const 后 = 原.map((g) => { const h = 抄(g); 填封闭腔(h); 埋格换石(h); return h; });
  // 留裙边的做法下，相邻区段共用的那几列两份抄本应该一样
  for (const [甲, 乙, 竖] of [[0, 1, 0], [2, 3, 0], [0, 2, 1], [1, 3, 1]] as const) {
    const A = 后[甲]!, B = 后[乙]!;
    for (let t = 0; t < 边; t++) for (const [ca, cb] of [[32, 0], [33, 1]] as const) {
      const pa = 竖 ? ca * 边 + t : t * 边 + ca, pb = 竖 ? cb * 边 + t : t * 边 + cb;
      for (let z = Math.max(A.kBottom, B.kBottom); z < Math.min(A.kBottom + A.nz, B.kBottom + B.nz); z++) {
        const x = A.cm[pa * A.nz + z - A.kBottom]!, y = B.cm[pb * B.nz + z - B.kBottom]!;
        if (A.色板[2 * x] !== B.色板[2 * y] || A.色板[2 * x + 1] !== B.色板[2 * y + 1]) 抄本不同++;
      }
    }
  }
  st.组++;
  st.四个原样 += (项 as 区段项[]).reduce((n, x) => n + x.len, 0);
  st['四个1+3'] += 后.reduce((n, g) => n + 压区段(成区段(g), 包.模型).length, 0);
  st.拼原样 += 压宽(排色板(拼(原, 包.石状态, 包.状态满)), L, 包.模型).length;
  const 拼后 = 拼(后, 包.石状态, 包.状态满);
  st['拼1+3'] += 压宽(排色板(拼后), L, 包.模型).length;
  填封闭腔(拼后); 埋格换石(拼后);
  st['拼后再做1+3'] += 压宽(排色板(拼后), L, 包.模型).length;
}
const 合 = Object.fromEntries(列.map((k) => [k, 0])) as Record<(typeof 列)[number], number>;
let 权 = 0;
for (let L = 0; L < 7; L++) if (统[L]!.组) { 权 += 全包级字节[L]!; for (const k of 列) 合[k] += 全包级字节[L]! * 统[L]![k] / 统[L]!.四个原样; }
console.log(JSON.stringify({
  包: 包名, 每级, 保真: 保真文件 ?? null, 抄本不同的格: 抄本不同,
  级: 统.map((x, L) => ({ L, ...x, 拼比四个_原样: x.组 ? x.拼原样 / x.四个原样 : null, 拼比四个_1加3: x.组 ? x['拼1+3'] / x['四个1+3'] : null, 拼后再做比四个_1加3: x.组 ? x['拼后再做1+3'] / x['四个1+3'] : null })),
  // 各级样本比 × 全包该级区段字节；没有成组样本的级不算进分母
  加权估计_对现行格式: Object.fromEntries(列.map((k) => [k, 合[k] / 权])), 加权覆盖的字节占比: 权 / 全包级字节.reduce((a, b) => a + b, 0),
}, null, 1));
