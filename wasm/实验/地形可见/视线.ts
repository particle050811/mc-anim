// 按「看不看得见」处理深洞的原型（用户 11-14 嫌按洞深截「太简单粗暴」）：从镜头可能在的地方沿直线看不到的洞填石头。只估，不是验收过的变换。
//   node wasm/实验/地形可见/视线.ts <包名> [--级 <L，默认 0>] [--集 <清单>] [--片 <最多几片，默认 8>] [--保真 <清单>]
//        [--线 <采样方向每轴最大分量，默认 3，0 = 不采样>] [--源点 <1|9>] [--余量 <看得见的格往外留几格，默认 1>] [--圈 <四周留几个区段>]
//        [--象限] [--锚 <区段键,…>] [--只无边] [--上并] [--细 <K，默认 1>] [--随机线 <每格几条，默认 0>] [--口 <米,…>] [--带 <格>] [--接力] [--报面] > 结果.json
// 片的拼法同 洞深.ts（同级 n×n 个区段，量正中 16 段；--集 时清单里每个区段各拼一片、只量它自己）。
// 片外不知道，所以每个数给两头：「片边当镜头」（片边 2 圈的非整格都当镜头位置，只会多留）和「无边」（片外当没有镜头，只会少留）；
//   真做是整级一遍扫过去，没有片边，数落在两头之间。--圈 加大看「无边」那头还涨不涨（--锚 点名哪几片，--只无边 不算「片边当镜头」和洞深，省内存）。
// 粗级（--上并，L ≥ 1）：近处画第 0 级、远处画粗级，视线先穿过第 0 级的缝再落到粗级的格上，只在粗级自己的格子里算会漏。
//   粗级合并是不透明优先（有一个子格不透明，父格就不透明），粗级的空都落在第 0 级的空里，所以混着画的视线都是第 0 级里的视线：
//   粗级的格只要有一个第 0 级子格看得见就留（「上并」），再并上粗级自己算的。同一片地方的第 0 级另拼一片来算。
// 镜头位置（一阶）= 露天格：头顶再没有整格不透明的非整格，含峡谷底、露天坑、崖前、水里。二阶 = 一阶看得见的格都可能站镜头（屋檐下、洞口里天光直着照得到的地方）。
// 保守集（保证不漏）：一条有宽度的直线穿过的格子是六邻相连、三个轴各自不回头的一串；主轴每走一步，另两个轴各至多走一步。
//   「锥」= 按主轴和三个符号分 24 个锥各扫一遍，状态记「上次主轴走完以后另两轴走没走过」，能到的非整格就是可能看得见的。它是真可见集的超集。
//   「象限」= 只要求三个轴不回头（8 个象限），更松，留作对照。
//   --细 K（2 或 3）= 每个锥里两个副轴再各按斜率分 K 档（斜率 1/(t+2)～1/(t+1) 的线，两次副轴步之间主轴正好走 t+1 或 t+2 步；最后一档斜率 ≤ 1/K，至少走 K 步），
//   一共 24·K² 遍，还是超集，比 24 锥紧。K > 1 时不算二阶和「片边当镜头」。
// 采样集（只会少不会多）：从洞格里的点朝各整数方向打线，走到露天格算看得见，线上经过的格一并算。用来量保守集多留了多少、按洞深截误伤了多少。
//   --接力：采样线确认过的格记下它看到的那个露天格，再让挨着它的没确认的格朝同一个露天格打线，打得通就也算看得见，一圈圈接下去。
//   窄口子后面的洞靠均匀方向很难碰上，接力以后下头紧得多（仍然只会少不会多）。
//   --随机线：再从保守集外的洞格里随机一点朝随机方向打线（方向不限整数），到得了露天格就是证明或实现有错。
// --带 R：露天格往外 R 格以内（六邻、穿非整格）的也当镜头位置（方案「最终+视线一阶无边+带」），只算无边。
// --口 N：保守集之外，洞口往里（从露天格走六邻）N 米以内的也留，给镜头稍微探进洞口留余地（方案「最终+视线一阶无边+口N」）。
// 「最终+视线一阶无边+深处要确认」（采样时才有）：保守集里洞深 128 米以外的格，采样线真看到了才留；深处没有证明，量保守集在深洞里松了多少。
// 余量：保守集往外 26 邻再留几格才开始填，给非整格方块自己的面、阴影偏移、多重采样的边留地方。
// 面的核对：网格是贪心合并过的，拆成单位面比。朝着保守集里的格、或者自己那格在保守集里的面，填完以后一张不许变（裙边四组不比）。
//   已知的一类例外（不是填错）：网格合并的键不含面在格子里的深度，半高的整格面（楼梯下半块的顶面）会和旁边同贴图的整格顶面并成一张、深度跟最左下那格；
//   那格被填掉以后合并换了代表格，留着的那张面回到自己的深度（暮色峡谷集 0/-37/121 高塔里一段云杉楼梯，1 张；主世界第 1 级 1/68/8 一张贴在格子上下面的花草类薄片，差一整格）。自查里单记「面只换了深度」，不算进「面变了」。
//   自查里「粗级空而第0级子格实心」不是 0：粗级存得比第 0 级深（它的 k底 按整个粗段最低的地表定），那里第 0 级没存、当实心；另有零星树叶压过原木的格。
import fs from 'node:fs';
import { 载入, 开包, 留出集, 成格子, 抄, 成区段, 压, 键, terrain根, 边, type 格子, type 区段项 } from './公共.ts';
import { 埋格换石, 填封闭腔, 邻圈归一, 核心边换石 } from './变换.ts';
import { 建网格 } from './核对.ts';
import type { SectionMesh } from '../../../engine/voxel/网格.ts';
import { 锥达 as 锥达原, 细锥达 as 细锥达原 } from './视线锥.ts';

const 参 = process.argv.slice(2), 包名 = 参[0]!;
const 取参 = (名: string) => { const i = 参.indexOf(名); return i < 0 ? undefined : 参[i + 1]; };
const L = Number(取参('--级') ?? 0), 片数 = Number(取参('--片') ?? 8), 线N = Number(取参('--线') ?? 3), 源点数 = Number(取参('--源点') ?? 1), 余量 = Number(取参('--余量') ?? 1);
const 深格 = Math.round(128 / 2 ** L), 集 = 取参('--集'), 量边 = 集 ? 1 : 4;
const 圈 = Number(取参('--圈') ?? Math.max(2, Math.ceil(深格 / 32))), n = 2 * 圈 + 量边, W = 32 * n + 2;
const 环 = await 载入(), 包 = 开包(环, terrain根(), 包名);
const 保真文件 = 取参('--保真'), 保真 = new Set(保真文件 ? fs.readFileSync(保真文件, 'utf8').split('\n').filter(Boolean) : []);
const 点名 = 取参('--锚')?.split(',');
const 锚: 区段项[] = (点名 ? 点名.map((k) => 包.查.get(k)!) : 集 ? fs.readFileSync(集, 'utf8').split('\n').map((l) => l.trim().split(/\s+/)[0]!).filter(Boolean).map((k) => 包.查.get(k)!) : 留出集(包).测).filter((s) => s.id.L === L);

// 采样用的线：每个方向、每个起点，先把线穿过的格子（相对起点那格）排好。起点不放在格子正中，线就不会正好擦着棱过去
const 线们: { ox: Int16Array; oy: Int16Array; ok: Int16Array }[] = [];
if (线N > 0) {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
  const 起 = [[0.5137, 0.5291, 0.5463]];
  if (源点数 > 1) for (let c = 0; c < 8; c++) 起.push([c & 1 ? 0.8137 : 0.2137, c & 2 ? 0.8291 : 0.2291, c & 4 ? 0.8463 : 0.2463]);
  for (let dz = -线N; dz <= 线N; dz++) for (let dy = -线N; dy <= 线N; dy++) for (let dx = -线N; dx <= 线N; dx++) {
    if (gcd(gcd(dx, dy), dz) !== 1) continue;
    for (const o of 起) {
      const d = [dx, dy, dz], 步 = d.map(Math.sign), 隔 = d.map((v) => (v ? 1 / Math.abs(v) : Infinity)), 到 = d.map((v, t) => (v > 0 ? (1 - o[t]!) / v : v < 0 ? o[t]! / -v : Infinity));
      const p = [0, 0, 0], xs: number[] = [], ys: number[] = [], ks: number[] = [];
      while (Math.abs(p[0]!) <= W && Math.abs(p[1]!) <= W && Math.abs(p[2]!) <= 2048) {
        const t = 到[0]! <= 到[1]! && 到[0]! <= 到[2]! ? 0 : 到[1]! <= 到[2]! ? 1 : 2;
        p[t]! += 步[t]!; 到[t]! += 隔[t]!;
        xs.push(p[0]!); ys.push(p[1]!); ks.push(p[2]!);
      }
      线们.push({ ox: Int16Array.from(xs), oy: Int16Array.from(ys), ok: Int16Array.from(ks) });
    }
  }
}

const 材质 = ['实心', '镂空', '实心树叶', '水', '花草'] as const;
/** 网格里和 可见 的格有关的面（朝着它，或者自己那格就是它），拆成单位面：键 = 材质/组/位置，值 = 贴图和颜色。可见 的下标同 格子.cm。
 *  全 = 所有整格面按「材质/组/面内位置|贴图颜色」记深度，给 面差 认「同一张面只是深度差了不到一格」用 */
const 可见面 = (m: SectionMesh, nz: number, 可见: Uint8Array) => {
  const 出 = new Map<string, string>(), 全 = new Map<string, number[]>(), e = 1 / 128;
  const 在 = (x: number, y: number, z: number) => { const cx = Math.floor(x) + 1, cy = Math.floor(y) + 1, cz = Math.floor(z); return cx >= 0 && cy >= 0 && cz >= 0 && cx < 边 && cy < 边 && cz < nz && 可见[(cy * 边 + cx) * nz + cz] === 1; };
  for (const 名 of 材质) {
    const f = m[名];
    for (let g = 0; g < 7; g++) for (let q = f.段[g]!; q < f.段[g + 1]!; q++) {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], 心 = [0, 0, 0];
      for (let v = 0; v < 4; v++) for (let t = 0; t < 3; t++) { const p = f.pos[q * 12 + v * 3 + t]! / 64; lo[t] = Math.min(lo[t]!, p); hi[t] = Math.max(hi[t]!, p); 心[t]! += p / 4; }
      const 属 = `${f.tex.subarray(q * 16, q * 16 + 16).join()}|${f.col.subarray(q * 16, q * 16 + 16).join()}`;
      const 轴 = g >> 1, ua = 轴 === 0 ? 1 : 0, va = 轴 === 2 ? 1 : 2;
      if (g < 6 && Number.isInteger(lo[ua]) && Number.isInteger(hi[ua]) && Number.isInteger(lo[va]) && Number.isInteger(hi[va]) && hi[ua]! > lo[ua]! && hi[va]! > lo[va]!) {
        // 合并过的整格面：贴图按格平铺，拆开每格一样
        const p = [0, 0, 0], q2 = [0, 0, 0];
        for (let u = lo[ua]!; u < hi[ua]!; u++) for (let v = lo[va]!; v < hi[va]!; v++) {
          p[ua] = q2[ua] = u + 0.5; p[va] = q2[va] = v + 0.5; p[轴] = 心[轴]! + e; q2[轴] = 心[轴]! - e;
          if (在(p[0]!, p[1]!, p[2]!) || 在(q2[0]!, q2[1]!, q2[2]!)) 出.set(`${名}/${g}/${u},${v},${心[轴]}`, 属);
          const kk = `${名}/${g}/${u},${v}|${属}`, 有 = 全.get(kk);
          if (有) 有.push(心[轴]!); else 全.set(kk, [心[轴]!]);
        }
        continue;
      }
      // 不是整格的面（半砖、栅栏、花草的十字面）：整张当一个面，按面心和沿轴前后各挪一点找格
      const p = 心.slice(), q2 = 心.slice();
      if (g < 6) { p[轴]! += e; q2[轴]! -= e; }
      if (在(p[0]!, p[1]!, p[2]!) || 在(q2[0]!, q2[1]!, q2[2]!)) 出.set(`${名}/${g}/${f.pos.subarray(q * 12, q * 12 + 12).join()}`, `${属}|${f.uv.subarray(q * 8, q * 8 + 8).join()}`);
    }
  }
  return { 面: 出, 全 };
};
type 面集 = ReturnType<typeof 可见面>;
/** 变 = 对不上的单位面；其中另一边同一位置、同贴图颜色、深度差不超过一格的另记 换深度（合并换了代表格，见文件头「已知的一类例外」） */
const 面差 = (a: 面集, b: 面集) => {
  let 变 = 0, 换深度 = 0;
  const 查 = (k: string, v: string, 对面: 面集, 哪边: string) => {
    const 末 = k.lastIndexOf(','), 深 = Number(k.slice(末 + 1)), 别 = Number.isFinite(深) && k.split('/')[2]!.split(',').length === 3 ? 对面.全.get(`${k.slice(0, 末)}|${v}`) : undefined;
    if (别?.some((d) => d !== 深 && Math.abs(d - 深) <= 1)) 换深度++; else { 变++; if (报面) console.error('面变了', 哪边, k, v.slice(0, 40)); }
  };
  for (const [k, v] of a.面) if (b.面.get(k) !== v) 查(k, v, b, b.面.has(k) ? '两边都有、贴图颜色不同' : '只有前一边有');
  for (const [k, v] of b.面) if (!a.面.has(k)) 查(k, v, a, '只有后一边有');
  return { 变, 换深度 };
};

const 随机线 = Number(取参('--随机线') ?? 0);
const 要象限 = 参.includes('--象限'), 只无边 = 参.includes('--只无边'), 上并 = 参.includes('--上并') && L > 0, f = 2 ** L, n0 = n * f;
const 口们 = 只无边 ? [] : (取参('--口') ?? '').split(',').filter(Boolean).map(Number), 接力 = 参.includes('--接力'), 报面 = 参.includes('--报面'), 细 = Number(取参('--细') ?? 1), 带 = Number(取参('--带') ?? 0), 算边 = !只无边 && 细 === 1, 算二阶 = 细 === 1;
if (细 < 1 || 细 > 3) throw new Error('--细 只认 1、2、3');
const 方案 = ['最终', ...(只无边 ? [] : ['最终+洞深128']), ...(算边 ? ['最终+视线一阶', '最终+视线二阶'] : []), '最终+视线一阶无边', ...口们.map((m) => `最终+视线一阶无边+口${m}`), ...(!只无边 && 线N > 0 ? ['最终+视线一阶无边+深处要确认'] : []), ...(带 > 0 ? ['最终+视线一阶无边+带'] : []), ...(算二阶 ? ['最终+视线二阶无边'] : []), ...(上并 ? ['最终+视线一阶上并', ...(算二阶 ? ['最终+视线二阶上并'] : [])] : []), ...(要象限 ? ['最终+象限一阶'] : []), ...(线N > 0 ? ['最终+采样一阶'] : [])];
const 零 = () => Object.fromEntries(方案.map((k) => [k, 0]));
const 合 = {
  片: 0, 段: 0, 原样: { 字节: 0, 面: 0, 画的面: 0, 实心画的面: 0 }, 字节: 零(), 面: 零(), 画的面: 零(), 实心画的面: 零(),
  // 洞格 = 量的区段核心里不是露天的非整格
  洞格: { 全部: 0, 象限一阶留: 0, 视线一阶留: 0, 视线一阶留_片边不算镜头: 0, 视线带留: 0, 视线二阶留: 0, 视线二阶留_片边不算镜头: 0, 视线一阶上并留: 0, 视线二阶上并留: 0, 上并留而本级自己算不留: 0, 采样一阶留: 0, 视线一阶集里: 0, 视线二阶集里: 0, 采样线看得到: 0, 采样线只到片边: 0 },
  洞深128: { 填的格: 0, 其中在视线一阶集里: 0, 其中在视线二阶集里: 0, 其中在视线一阶无边集里: 0, 其中采样线看得到: 0, 有采样线看得到的段: 0, 留的格里视线一阶无边不留的: 0 },
  // 都该是 0：采样线看得到却不在保守集里（证明或实现有错）；填完以后和保守集有关的面变了
  自查: { 采样线看得到却不在视线一阶集里: 0, 采样线看得到却不在视线一阶无边集里: 0, 不在集里又抽查过的格: 0, 视线一阶_面变了: 0, 视线二阶_面变了: 0, 视线一阶无边_面变了: 0, 视线带_面变了: 0, 视线二阶无边_面变了: 0, 视线一阶上并_面变了: 0, 视线二阶上并_面变了: 0, 象限一阶_面变了: 0, 面只换了深度_合并换代表格: 0, 比过的单位面: 0, 粗级空而第0级子格实心: 0, 粗级空的子格: 0, 随机线到得了露天: 0, 随机线条数: 0, 随机线起点格: 0 },
  耗时毫秒: { 拼片: 0, 洞深: 0, 象限: 0, 锥每遍: [] as number[], 采样: 0, 接力: 0, 编码建网格: 0 }, 片格数: [] as number[],
  // 每片各留多少洞格（同一个锚换 --圈 重跑，比「无边」那头涨没涨）
  片们: [] as { 锚: string; 洞格: number; 一阶: number; 一阶无边: number; 二阶: number; 二阶无边: number }[],
};
const 归空表 = (g: 格子) => Uint8Array.from({ length: g.色板.length / 2 }, (_, p) => (p && 包.状态罩[g.色板[2 * p]!] === 0 ? 1 : 0));
const 收尾 = (g: 格子) => { 埋格换石(g); 邻圈归一(g, true, 归空表(g)); if (L === 0) 核心边换石(g, [true, true, true, true]); return g; };
const 画的 = (m: SectionMesh) => 材质.reduce((s, k) => s + m[k].段[7]!, 0);

/** n×n 个同级区段拼成一片。实 = 整格不透明（各段 k底 以下按网格的规矩当实心，存的最高一层以上是空气）；天 = 露天格 */
const 拼 = (段: 格子[], n: number) => {
  const W = 32 * n + 2;
  let kb = Infinity, 顶 = -Infinity;
  for (const g of 段) { kb = Math.min(kb, g.kBottom); 顶 = Math.max(顶, g.kBottom + g.nz); }
  const nz = 顶 - kb, N = W * W * nz, 实 = new Uint8Array(N), 天 = new Uint8Array(N);
  for (let Y = 0; Y < W; Y++) for (let X = 0; X < W; X++) {
    const a = Math.min(n - 1, Math.max(0, Math.floor((X - 1) / 32))), b = Math.min(n - 1, Math.max(0, Math.floor((Y - 1) / 32))), g = 段[b * n + a]!;
    const 源 = ((Y - 32 * b) * 边 + X - 32 * a) * g.nz, 目 = (Y * W + X) * nz, 垫 = g.kBottom - kb;
    实.fill(1, 目, 目 + 垫);
    for (let k = 0; k < g.nz; k++) 实[目 + 垫 + k] = g.满[g.cm[源 + k]!]!;
    for (let k = nz - 1; k >= 0 && !实[目 + k]; k--) 天[目 + k] = 1;
  }
  return { W, kb, nz, N, 实, 天 };
};
/** 两个锥在 视线锥.ts（和 锥对拍.ts 共用），这里只记每次的耗时 */
const 锥达 = (...a: Parameters<typeof 锥达原>) => { 合.耗时毫秒.锥每遍.push(锥达原(...a)); };
const 细锥达 = (...a: Parameters<typeof 细锥达原>) => { 合.耗时毫秒.锥每遍.push(细锥达原(...a)); };
/** 三个轴各自不回头就算能到（8 个象限） */
const 象限达 = (实: Uint8Array, 源: Uint8Array, 出: Uint8Array, 态: Uint8Array, W: number, nz: number) => {
  const 行 = W * nz;
  for (let o = 0; o < 8; o++) {
    const sX = o & 1 ? 1 : -1, sY = o & 2 ? 1 : -1, sK = o & 4 ? 1 : -1;
    for (let yi = 0; yi < W; yi++) for (let xi = 0; xi < W; xi++) {
      const Y = sY > 0 ? yi : W - 1 - yi, X = sX > 0 ? xi : W - 1 - xi, base = (Y * W + X) * nz;
      const pX = xi > 0 ? base - sX * nz : -1, pY = yi > 0 ? base - sY * 行 : -1;
      for (let ki = 0; ki < nz; ki++) {
        const k = sK > 0 ? ki : nz - 1 - ki, at = base + k;
        if (实[at]) { 态[at] = 0; continue; }
        const v = 源[at] || (pX >= 0 && 态[pX + k]) || (pY >= 0 && 态[pY + k]) || (ki > 0 && 态[at - sK]) ? 1 : 0;
        态[at] = v;
        if (v) 出[at] = 1;
      }
    }
  }
};

for (const s of 锚) {
  if (合.片 >= 片数) break;
  const 项 = Array.from({ length: n * n }, (_, t) => 包.查.get(键({ L, i: s.id.i - 圈 + (t % n), j: s.id.j - 圈 + Math.floor(t / n) })));
  if (项.some((x) => !x || 保真.has(键(x.id)))) continue;
  const 细项 = 上并 ? Array.from({ length: n0 * n0 }, (_, t) => 包.查.get(键({ L: 0, i: (s.id.i - 圈) * f + (t % n0), j: (s.id.j - 圈) * f + Math.floor(t / n0) }))) : [];
  if (细项.some((x) => !x)) continue;
  let t0 = performance.now();
  const 计 = () => { const t = performance.now(), d = t - t0; t0 = t; return d; };
  const 段 = 项.map((x) => 成格子(包, 包.解(x!)));
  const { kb, nz, N, 实, 天 } = 拼(段, n), 行 = W * nz;
  合.耗时毫秒.拼片 += 计();
  // 起 = 镜头位置（露天格加片边 2 圈的非整格）；步 = 洞深（对照）：从 起 走六邻的步数，同 洞深.ts
  const 起 = 只无边 ? 天 : new Uint8Array(N), 步 = new Uint8Array(只无边 ? 0 : N).fill(255);
  if (!只无边) {
    const 队 = new Int32Array(N);
    let 头 = 0, 尾 = 0;
    for (let Y = 0; Y < W; Y++) for (let X = 0; X < W; X++) {
      const 目 = (Y * W + X) * nz, 片边 = X < 2 || Y < 2 || X >= W - 2 || Y >= W - 2;
      for (let k = 0; k < nz; k++) if (天[目 + k] || (片边 && !实[目 + k])) { 起[目 + k] = 1; 步[目 + k] = 0; 队[尾++] = 目 + k; }
    }
    while (头 < 尾) {
      const at = 队[头++]!, d = 步[at]! + 1, c = Math.floor(at / nz), k = at - c * nz, X = c % W, Y = (c - X) / W;
      if (d > 254) continue;
      const 进 = (to: number) => { if (!实[to] && 步[to] === 255) { 步[to] = d; 队[尾++] = to; } };
      if (k > 0) 进(at - 1);
      if (k < nz - 1) 进(at + 1);
      if (X > 0) 进(at - nz);
      if (X < W - 1) 进(at + nz);
      if (Y > 0) 进(at - 行);
      if (Y < W - 1) 进(at + 行);
    }
    合.耗时毫秒.洞深 += 计();
  }
  const 态 = new Uint8Array(N), 象一 = new Uint8Array(要象限 ? N : 0), 视一无边 = new Uint8Array(N), 视二无边 = new Uint8Array(算二阶 ? N : 0);
  if (要象限) 象限达(实, 起, 象一, 态, W, nz);
  合.耗时毫秒.象限 += 计();
  if (细 > 1) 细锥达(实, 天, 视一无边, W, nz, 细); else 锥达(实, 天, 视一无边, 态, W, nz);
  if (算二阶) 锥达(实, 视一无边, 视二无边, 态, W, nz);
  // --带 R：露天格往外（六邻、穿非整格）R 格以内的也当镜头位置，给屋檐、树干底下、洞口里几步的机位。带源的值 = 离露天几格 + 1
  const 视带 = new Uint8Array(带 > 0 ? N : 0);
  if (带 > 0) {
    const 带源 = 天.slice();
    for (let r = 1; r <= 带; r++) for (let Y = 0; Y < W; Y++) for (let X = 0; X < W; X++) for (let k = 0, at = (Y * W + X) * nz; k < nz; k++, at++) {
      if (实[at] || 带源[at]) continue;
      if ((k > 0 && 带源[at - 1] === r) || (k < nz - 1 && 带源[at + 1] === r) || (X > 0 && 带源[at - nz] === r) || (X < W - 1 && 带源[at + nz] === r) || (Y > 0 && 带源[at - 行] === r) || (Y < W - 1 && 带源[at + 行] === r)) 带源[at] = r + 1;
    }
    if (细 > 1) 细锥达(实, 带源, 视带, W, nz, 细); else 锥达(实, 带源, 视带, 态, W, nz);
  }
  const 视一 = 算边 ? new Uint8Array(N) : 视一无边, 视二 = 算边 ? new Uint8Array(N) : 视二无边;
  if (算边) { 锥达(实, 起, 视一, 态, W, nz); 锥达(实, 视一, 视二, 态, W, nz); }
  // 上并：同一片地方的第 0 级看得见的格并到本级，再并上本级自己算的
  const 并一 = new Uint8Array(上并 ? N : 0), 并二 = new Uint8Array(上并 ? N : 0);
  if (上并) {
    const p = 拼(细项.map((x) => 成格子(包, 包.解(x!))), n0), 态0 = new Uint8Array(细 > 1 ? 0 : p.N), 视0 = new Uint8Array(p.N), 视0二 = new Uint8Array(p.N);
    if (细 > 1) 细锥达(p.实, p.天, 视0, p.W, p.nz, 细); else 锥达(p.实, p.天, 视0, 态0, p.W, p.nz);
    if (算二阶) 锥达(p.实, 视0, 视0二, 态0, p.W, p.nz);
    for (let Y0 = 1; Y0 < p.W - 1; Y0++) for (let X0 = 1; X0 < p.W - 1; X0++) {
      const b0 = (Y0 * p.W + X0) * p.nz, b1 = ((1 + ((Y0 - 1) >> L)) * W + 1 + ((X0 - 1) >> L)) * nz;
      for (let k0 = 0; k0 < p.nz; k0++) {
        const k = Math.floor((p.kb + k0) / f) - kb;
        if (k < 0 || k >= nz) continue;
        if (视0[b0 + k0]) 并一[b1 + k] = 1;
        if (视0二[b0 + k0]) 并二[b1 + k] = 1;
        if (!实[b1 + k]) { 合.自查.粗级空的子格++; if (p.实[b0 + k0]) 合.自查.粗级空而第0级子格实心++; }
      }
    }
    for (let at = 0; at < N; at++) { if (视一无边[at]) 并一[at] = 1; if (视二无边[at]) 并二[at] = 1; }
  }
  计();
  合.片格数.push(N);

  // 采样：量的区段四周多算 余量 + 1 格。见 = 1 看得到露天，2 只走到片边
  const 见 = new Uint8Array(线N > 0 ? N : 0), lo = 32 * 圈 - 余量 - 1, hi = 32 * (圈 + 量边) + 2 + 余量 + 1;
  // 靶 = 这一格确认看到的露天格（X、Y、k 压成一个数；k 可以到 nz，表示存的顶上面）
  const 靶 = new Float64Array(接力 && 线N > 0 ? N : 0);
  if (线N > 0) {
    let 抽 = 0;
    for (let Y = lo; Y < hi; Y++) for (let X = lo; X < hi; X++) for (let k = 0; k < nz; k++) {
      const at0 = (Y * W + X) * nz + k;
      if (实[at0] || 天[at0] || 见[at0] === 1) continue;
      if (!视一[at0]) { if (抽++ % 8) continue; 合.自查.不在集里又抽查过的格++; }
      let 到边 = 0;
      找: for (const { ox, oy, ok } of 线们) for (let t = 0; ; t++) {
        const kk = k + ok[t]!, XX = X + ox[t]!, YY = Y + oy[t]!;
        let 成 = kk >= nz;
        if (!成) {
          if (XX < 0 || YY < 0 || XX >= W || YY >= W) { 到边 = 2; break; }
          if (kk < 0) break;
          const at = (YY * W + XX) * nz + kk;
          if (实[at]) break;
          成 = 天[at] === 1;
        }
        if (成) {
          见[at0] = 1;
          for (let u = 0; u < t; u++) 见[((Y + oy[u]!) * W + X + ox[u]!) * nz + k + ok[u]!] = 1;
          if (接力) { const 号 = (YY * W + XX) * (nz + 1) + Math.min(kk, nz); 靶[at0] = 号; for (let u = 0; u < t; u++) 靶[((Y + oy[u]!) * W + X + ox[u]!) * nz + k + ok[u]!] = 号; }
          break 找;
        }
      }
      if (见[at0] !== 1 && 到边) 见[at0] = 2;
    }
    合.耗时毫秒.采样 += 计();
    if (接力) {
      // 从格 (X, Y, k) 里的一点朝露天格 号 的中心打线，中间不撞整格就算通
      const 通 = (X: number, Y: number, k: number, 号: number, ox: number, oy: number, ok: number) => {
        const tk = 号 % (nz + 1), c = (号 - tk) / (nz + 1), tx = c % W, ty = (c - tx) / W;
        const 起点 = [X + ox, Y + oy, k + ok], d = [tx + 0.5 - 起点[0]!, ty + 0.5 - 起点[1]!, tk + 0.5 - 起点[2]!], p = [X, Y, k];
        const 向 = d.map(Math.sign), 隔 = d.map((v) => (v ? 1 / Math.abs(v) : Infinity)), 到 = d.map((v, t) => { const o = 起点[t]! - p[t]!; return v > 0 ? (1 - o) / v : v < 0 ? o / -v : Infinity; });
        for (;;) {
          const t = 到[0]! <= 到[1]! && 到[0]! <= 到[2]! ? 0 : 到[1]! <= 到[2]! ? 1 : 2;
          if (到[t]! > 1) return true;
          p[t]! += 向[t]!; 到[t]! += 隔[t]!;
          if (p[2]! >= nz) return true;
          if (p[0]! < 0 || p[1]! < 0 || p[0]! >= W || p[1]! >= W || p[2]! < 0) return false;
          const at = (p[1]! * W + p[0]!) * nz + p[2]!;
          if (实[at]) return false;
          if (天[at]) return true;
        }
      };
      const 队 = new Int32Array((hi - lo) * (hi - lo) * nz);
      let 头 = 0, 尾 = 0;
      for (let Y = lo; Y < hi; Y++) for (let X = lo; X < hi; X++) for (let k = 0; k < nz; k++) { const at = (Y * W + X) * nz + k; if (见[at] === 1 && !天[at]) 队[尾++] = at; }
      while (头 < 尾) {
        const at = 队[头++]!, 号 = 靶[at]!, c = Math.floor(at / nz), k = at - c * nz, X = c % W, Y = (c - X) / W;
        for (let dY = -1; dY <= 1; dY++) for (let dX = -1; dX <= 1; dX++) for (let dk = -1; dk <= 1; dk++) {
          const XX = X + dX, YY = Y + dY, kk = k + dk;
          if (XX < lo || YY < lo || XX >= hi || YY >= hi || kk < 0 || kk >= nz) continue;
          const to = (YY * W + XX) * nz + kk;
          if (实[to] || 天[to] || 见[to] === 1) continue;
          if (通(XX, YY, kk, 号, 0.5137, 0.5291, 0.5463) || 通(XX, YY, kk, 号, 0.2137, 0.8291, 0.2463) || 通(XX, YY, kk, 号, 0.8137, 0.2291, 0.8463)) { 见[to] = 1; 靶[to] = 号; 队[尾++] = to; }
        }
      }
      合.耗时毫秒.接力 += 计();
    }
  }
  if (随机线 > 0) {
    let 种 = 31841 + 合.片, 抽 = 0;
    const 随 = () => { 种 = (Math.imul(种, 1664525) + 1013904223) >>> 0; return (种 + 0.5) / 4294967296; };
    for (let Y = lo; Y < hi; Y++) for (let X = lo; X < hi; X++) for (let k = 0; k < nz; k++) {
      const at0 = (Y * W + X) * nz + k;
      if (实[at0] || 视一无边[at0] || 抽++ % 4) continue;
      合.自查.随机线起点格++;
      for (let r = 0; r < 随机线; r++) {
        const z = 2 * 随() - 1, 角 = 2 * Math.PI * 随(), 横 = Math.sqrt(1 - z * z), d = [横 * Math.cos(角), 横 * Math.sin(角), z];
        const p = [X, Y, k], 向 = d.map(Math.sign), 隔 = d.map((v) => (v ? 1 / Math.abs(v) : Infinity)), 到 = d.map((v) => { const o = 随(); return v > 0 ? (1 - o) / v : v < 0 ? o / -v : Infinity; });
        合.自查.随机线条数++;
        for (;;) {
          const t = 到[0]! <= 到[1]! && 到[0]! <= 到[2]! ? 0 : 到[1]! <= 到[2]! ? 1 : 2;
          p[t]! += 向[t]!; 到[t]! += 隔[t]!;
          if (p[2]! >= nz) { 合.自查.随机线到得了露天++; break; }
          if (p[0]! < 0 || p[1]! < 0 || p[0]! >= W || p[1]! >= W || p[2]! < 0) break;
          const at = (p[1]! * W + p[0]!) * nz + p[2]!;
          if (实[at]) break;
          if (天[at]) { 合.自查.随机线到得了露天++; break; }
        }
      }
    }
    合.耗时毫秒.采样 += 计();
  }
  /** 集里的格往外 26 邻 余量 格以内算留 */
  const 近 = (集里: Uint8Array, X: number, Y: number, k: number) => {
    for (let dY = -余量; dY <= 余量; dY++) for (let dX = -余量; dX <= 余量; dX++) {
      const XX = X + dX, YY = Y + dY;
      if (XX < 0 || YY < 0 || XX >= W || YY >= W) continue;
      const base = (YY * W + XX) * nz;
      for (let kk = Math.max(0, k - 余量); kk <= Math.min(nz - 1, k + 余量); kk++) if (集里[base + kk]) return true;
    }
    return false;
  };
  const 采集 = new Uint8Array(线N > 0 ? N : 0);
  if (线N > 0) for (let at = 0; at < N; at++) 采集[at] = 天[at] || 见[at] === 1 ? 1 : 0;

  合.片++;
  const 这片 = { 锚: 键(s.id), 洞格: 0, 一阶: 0, 一阶无边: 0, 二阶: 0, 二阶无边: 0 };
  合.片们.push(这片);
  for (let b = 圈; b < 圈 + 量边; b++) for (let a = 圈; a < 圈 + 量边; a++) {
    const g0 = 段[b * n + a]!, 垫 = g0.kBottom - kb, m0 = 建网格(环, 包, g0);
    合.段++; 合.原样.字节 += 项[b * n + a]!.len; 合.原样.面 += m0.面数; 合.原样.画的面 += 画的(m0); 合.原样.实心画的面 += m0.实心.段[7]!;
    const 记 = (名: string, g: 格子) => { const m = 建网格(环, 包, g); 合.字节[名]! += 压(环, 成区段(g), 包.模型).length; 合.面[名]! += m.面数; 合.画的面[名]! += 画的(m); 合.实心画的面[名]! += m.实心.段[7]!; return m; };
    const g13 = 抄(g0);
    填封闭腔(g13);
    const m最终 = 记('最终', 收尾(抄(g13)));
    /** 留[at] = 0 的非整格填石头；可见 = 这一段窗口里在集里的格（核对面用） */
    const 填 = (留: (X: number, Y: number, k: number, at片: number) => boolean, 集里?: Uint8Array) => {
      const g = 抄(g13), 可见 = new Uint8Array(集里 ? g0.cm.length : 0);
      for (let y = 0; y < 边; y++) for (let x = 0; x < 边; x++) for (let k = 0; k < g0.nz; k++) {
        const at = (y * 边 + x) * g0.nz + k, X = 32 * a + x, Y = 32 * b + y, at片 = (Y * W + X) * nz + 垫 + k;
        if (集里 && 集里[at片]) 可见[at] = 1;
        if (!g0.满[g0.cm[at]!] && !留(X, Y, 垫 + k, at片)) g.cm[at] = g0.石;
      }
      return { g: 收尾(g), 可见 };
    };
    // 数洞格（只数核心，邻圈的格算在邻段头上）
    let 伤 = 0;
    for (let y = 1; y < 边 - 1; y++) for (let x = 1; x < 边 - 1; x++) for (let k = 0; k < g0.nz; k++) {
      const X = 32 * a + x, Y = 32 * b + y, at片 = (Y * W + X) * nz + 垫 + k;
      if (实[at片] || 天[at片]) continue;
      const c = 合.洞格, d = 合.洞深128;
      c.全部++; 这片.洞格++;
      const 留一无边 = 近(视一无边, X, Y, 垫 + k);
      if (要象限 && 近(象一, X, Y, 垫 + k)) c.象限一阶留++;
      if (近(视一, X, Y, 垫 + k)) { c.视线一阶留++; 这片.一阶++; }
      if (留一无边) { c.视线一阶留_片边不算镜头++; 这片.一阶无边++; }
      if (带 > 0 && 近(视带, X, Y, 垫 + k)) c.视线带留++;
      if (近(视二, X, Y, 垫 + k)) { c.视线二阶留++; 这片.二阶++; }
      if (近(视二无边, X, Y, 垫 + k)) { c.视线二阶留_片边不算镜头++; 这片.二阶无边++; }
      if (上并) { if (近(并一, X, Y, 垫 + k)) { c.视线一阶上并留++; if (!留一无边) c.上并留而本级自己算不留++; } if (近(并二, X, Y, 垫 + k)) c.视线二阶上并留++; }
      if (视一[at片]) c.视线一阶集里++;
      if (视二[at片]) c.视线二阶集里++;
      if (线N > 0) {
        if (近(采集, X, Y, 垫 + k)) c.采样一阶留++;
        if (见[at片] === 1) { c.采样线看得到++; if (!视一[at片]) 合.自查.采样线看得到却不在视线一阶集里++; if (!视一无边[at片]) 合.自查.采样线看得到却不在视线一阶无边集里++; } else if (见[at片] === 2) c.采样线只到片边++;
      }
      if (只无边) continue;
      if (步[at片]! > 深格) {
        d.填的格++;
        if (视一[at片]) d.其中在视线一阶集里++;
        if (视二[at片]) d.其中在视线二阶集里++;
        if (视一无边[at片]) d.其中在视线一阶无边集里++;
        if (见[at片] === 1) { d.其中采样线看得到++; 伤++; }
      } else if (!留一无边) d.留的格里视线一阶无边不留的++;
    }
    if (伤) 合.洞深128.有采样线看得到的段++;
    if (!只无边) 记('最终+洞深128', 填((_X, _Y, _k, at片) => 步[at片]! <= 深格).g);
    for (const [名, 集里, 查] of [['最终+视线一阶', 视一, '视线一阶_面变了'], ['最终+视线二阶', 视二, '视线二阶_面变了'], ['最终+视线一阶无边', 视一无边, '视线一阶无边_面变了'], ['最终+视线一阶无边+带', 视带, '视线带_面变了'], ['最终+视线二阶无边', 视二无边, '视线二阶无边_面变了'],
      ['最终+视线一阶上并', 并一, '视线一阶上并_面变了'], ['最终+视线二阶上并', 并二, '视线二阶上并_面变了'], ['最终+象限一阶', 象一, '象限一阶_面变了']] as const) {
      if (!方案.includes(名)) continue;
      // 上并的集里有「粗级封着、第 0 级敞着」的腔（封腔只看本段自己的格子，填它没错），所以上并和封完腔的网格比，别的和原样比
      const { g, 可见 } = 填((X, Y, k) => 近(集里, X, Y, k), 集里), 旧 = 可见面(名.endsWith('上并') ? m最终 : m0, g0.nz, 可见), 新 = 可见面(记(名, g), g0.nz, 可见);
      const 差 = 面差(旧, 新);
      合.自查[查] += 差.变; 合.自查.面只换了深度_合并换代表格 += 差.换深度;
      if (报面 && 差.变 + 差.换深度) console.error(键(g0.id), 名, JSON.stringify(差));
      if (名 === '最终+视线一阶无边') 合.自查.比过的单位面 += 旧.面.size;
    }
    for (const m of 口们) 记(`最终+视线一阶无边+口${m}`, 填((X, Y, k, at片) => 步[at片]! <= Math.round(m / 2 ** L) || 近(视一无边, X, Y, k)).g);
    if (线N > 0) 记('最终+采样一阶', 填((X, Y, k) => 近(采集, X, Y, k)).g);
    if (!只无边 && 线N > 0) {
      // 保守集在又宽又深的洞里偏松（暮色）：洞深 128 米以外的格，要采样线真看到了才留。深处不再有证明，只会比保守集少留
      const 确 = new Uint8Array(N);
      for (let at = 0; at < N; at++) 确[at] = 视一无边[at] && (步[at]! <= 深格 || 见[at] === 1) ? 1 : 0;
      记('最终+视线一阶无边+深处要确认', 填((X, Y, k) => 近(确, X, Y, k)).g);
    }
  }
  合.耗时毫秒.编码建网格 += 计();
}
const 比 = (x: Record<string, number>, 底: number) => Object.fromEntries(方案.map((k) => [k, x[k]! / 底]));
console.log(JSON.stringify({
  包: 包名, 级: L, 集: 点名 ? `点名 ${点名.join()}` : 集 ?? '留出集', 每边区段: n, 四周留几个区段: 圈, 只无边, 上并, 细, 接力, 采样方向每轴最大分量: 线N, 采样线条数: 线们.length, 余量, ...合,
  字节比原样: 比(合.字节, 合.原样.字节), 面比原样: 比(合.面, 合.原样.面), 画的面比原样: 比(合.画的面, 合.原样.画的面), 实心画的面比原样: 比(合.实心画的面, 合.原样.实心画的面),
}, null, 1));
