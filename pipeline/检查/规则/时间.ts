// 时间：段、场、库的画面代码按秒写（用户 11-06「不应该都是按函数那种写的吗」，docs/决策/0015-原生60帧.md），不直接调 useCurrentFrame()，
// 也不再用兼容层的 use编排fps()；时间一律从 engine/段/时间.tsx 取（use当前秒、秒Sequence，核对视图用 use视图下标）。
// 还没迁的文件冻在 docs/帧号例外表.tsv（按文件记处数，两种调用合起来数）：
// - 代码里比登记的多 → 违规（新写的，改用 use当前秒）；比登记的少、文件没了 → 违规（把表改小）。
// - 表的总处数和 main 的分叉点比只许减少（同 副本 规则）；改名、挪文件不加总数就行。不在 git 里（测试的样例仓库）就不比。
// 只查 engine、库 和这次查的作品的渲染代码（不含测试）；时间工具自己（时间.tsx、兼容层 编排时钟.tsx）不查。
import { execFileSync } from 'node:child_process';
import { 是渲染代码, type 报告, type 检查上下文 } from '../上下文.ts';
import { 解析, 遍历, 行号, ts } from '../语法.ts';

export const 帧号例外表路径 = 'docs/帧号例外表.tsv';
const 禁用 = new Set(['useCurrentFrame', 'use编排fps']);
const 时间工具 = new Set(['engine/段/时间.tsx', 'engine/段/编排时钟.tsx']);

/** 读例外表：# 开头的是注释，第一行非注释是表头（文件、处数） */
export const 读帧号例外表 = (文本: string): { 表: Map<string, number>; 错: string[] } => {
  const 表 = new Map<string, number>();
  const 错: string[] = [];
  let 见表头 = false;
  文本.split(/\r?\n/).forEach((行, i) => {
    if (!行.trim() || 行.startsWith('#')) return;
    if (!见表头) {
      见表头 = true;
      if (行 !== '文件\t处数') 错.push(`第 ${i + 1} 行：表头应是「文件<TAB>处数」`);
      return;
    }
    const [文件, 数] = 行.split('\t');
    const n = Number(数);
    if (!文件 || !Number.isInteger(n) || n <= 0) return void 错.push(`第 ${i + 1} 行：要两列，处数是正整数`);
    if (表.has(文件)) 错.push(`第 ${i + 1} 行：${文件} 重复`);
    表.set(文件, n);
  });
  return { 表, 错 };
};

/** 一个文件里直接调 useCurrentFrame()、use编排fps() 的行号 */
export const 查文件 = (文件: string, 源码: string): number[] => {
  if (!/useCurrentFrame|use编排fps/.test(源码)) return [];
  const sf = 解析(文件, 源码);
  const 行们: number[] = [];
  遍历(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && 禁用.has(n.expression.text)) 行们.push(行号(sf, n));
  });
  return 行们;
};

/** 由现状写出例外表（第一次建表用） */
export const 写帧号例外表 = (现状: Map<string, number[]>, 表头注释: string): string =>
  [表头注释.trimEnd(), '文件\t处数', ...[...现状.keys()].sort().map((p) => `${p}\t${现状.get(p)!.length}`)].join('\n') + '\n';

/** 代码里现在的直接调用（engine、库、本作品） */
export const 现状 = (c: 检查上下文): Map<string, number[]> => {
  const 全 = new Map<string, number[]>();
  for (const p of c.本作品文件()) {
    if (!是渲染代码(p) || 时间工具.has(p)) continue;
    const 行们 = 查文件(p, c.读(p));
    if (行们.length) 全.set(p, 行们);
  }
  return 全;
};

const 基线表 = (c: 检查上下文): string | null => {
  try {
    const git = (...a: string[]) => execFileSync('git', ['-C', c.根, '-c', 'core.quotepath=false', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return git('show', `${git('merge-base', 'HEAD', 'main').trim()}:${帧号例外表路径}`);
  } catch {
    return null;
  }
};

export const 时间 = (c: 检查上下文, 报: 报告) => {
  if (!c.存在(帧号例外表路径)) return void 报.错(`没有 ${帧号例外表路径}（还没迁到秒的文件的冻结表；都迁完也要留表头）`);
  const { 表, 错 } = 读帧号例外表(c.读(帧号例外表路径));
  for (const e of 错) 报.错(e, 帧号例外表路径);
  const 码 = 现状(c);
  const 在查 = (p: string) => /^(engine|库)\//.test(p) || p.startsWith(`${c.作品目录}/`);
  for (const [p, 行们] of 码) {
    const 准 = 表.get(p) ?? 0;
    if (行们.length > 准)
      报.错(`直接调 useCurrentFrame()/use编排fps() ${行们.length} 处（第 ${行们.join('、')} 行），例外表登记 ${准} 处：按秒写，改用 engine/段/时间.tsx 的 use当前秒`, p, 行们[0]);
    else if (行们.length < 准) 报.错(`直接调帧号的现在 ${行们.length} 处，例外表登记 ${准} 处：把 ${帧号例外表路径} 这一行改成 ${行们.length}`, p);
  }
  let 登记 = 0;
  for (const [p, n] of 表) {
    if (!在查(p)) continue;
    登记 += n;
    if (!码.has(p)) 报.错(`例外表登记 ${p} 有 ${n} 处，现在${c.存在(p) ? '没有了' : '文件都没了'}：删掉这一行`, 帧号例外表路径);
  }
  const 基 = 基线表(c);
  if (基 === null) 报.信息.push('和 main 的分叉点比不了（不在 git、没有 main，或那时还没有例外表），不查表只减不增');
  else {
    const 总 = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    const [新数, 旧数] = [总(表), 总(读帧号例外表(基).表)];
    if (新数 > 旧数) 报.错(`例外表从 ${旧数} 处加到 ${新数} 处：表只许减少，新代码按秒写`, 帧号例外表路径);
  }
  报.信息.push(`例外表里 engine、库、${c.作品名} 还有 ${登记} 处直接调帧号（没迁到秒）`);
};
