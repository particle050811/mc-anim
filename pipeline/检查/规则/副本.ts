// 副本：共用函数（lerp、smoothstep、toThree、Cam、插骨、原版挥手、原版下落……，表在 正本表.ts）只许有一份正本，新代码 import 它，不再自己写。
// 现有的旧副本登记在 docs/副本表.tsv（按 正本 × 文件 记处数）：迁移不改画面，旧段的代码原样不动（改了会让段过期），所以先冻住。
// - 代码里某个文件的副本比表里登记的多 → 违规（新写的副本，改成 import 正本）。
// - 比登记的少、文件没了 → 违规（把表改小：表只许减少，删掉的副本不许再加回来）。
// - 表本身和 main 的分叉点比，每个正本的总处数只许减少；改名、挪文件不加总数就行。不在 git 里（测试的样例仓库）就不比。
//   例外：分叉点的 正本表.ts 里还没有的正本（这次新加的），它的旧副本可以第一次登记进表。
// 只查 engine、库 和这次查的作品（渲染代码，不含测试）；别的作品的行留给查那部作品时比。pipeline 不能 import 渲染层，不查。
import { execFileSync } from 'node:child_process';
import { 是渲染代码, type 报告, type 检查上下文 } from '../上下文.ts';
import { 遍历, 行号, ts } from '../语法.ts';
import { 文件函数, 是函数节点, 行为一样 } from '../副本识别.ts';
import { 正本文件, 正本表, type 正本项 } from '../正本表.ts';

export const 副本表路径 = 'docs/副本表.tsv';

export type 一处 = { 行: number; 名?: string; 认法: '名字' | '行为' | '记号' };
/** 正本 id → 文件 → 各处 */
export type 副本现状 = Map<string, Map<string, 一处[]>>;
type 正本函数 = (...a: unknown[]) => unknown;

/** 读副本表：# 开头的是注释，第一行非注释是表头（正本、文件、处数） */
export const 读副本表 = (文本: string): { 表: Map<string, Map<string, number>>; 错: string[] } => {
  const 表 = new Map<string, Map<string, number>>();
  const 错: string[] = [];
  let 见表头 = false;
  文本.split(/\r?\n/).forEach((行, i) => {
    if (!行.trim() || 行.startsWith('#')) return;
    if (!见表头) {
      见表头 = true;
      if (行 !== '正本\t文件\t处数') 错.push(`第 ${i + 1} 行：表头应是「正本<TAB>文件<TAB>处数」`);
      return;
    }
    const [id, 文件, 数] = 行.split('\t');
    const n = Number(数);
    if (!id || !文件 || !Number.isInteger(n) || n <= 0) return void 错.push(`第 ${i + 1} 行：要三列，处数是正整数`);
    const 按文件 = 表.get(id) ?? 表.set(id, new Map()).get(id)!;
    if (按文件.has(文件)) 错.push(`第 ${i + 1} 行：${id} ${文件} 重复`);
    按文件.set(文件, n);
  });
  return { 表, 错 };
};

/** 由现状写出副本表（第一次建表、整理时用；行按 正本表 的顺序、再按文件排） */
export const 写副本表 = (现状: 副本现状, 表头注释: string): string => {
  const 行们 = [表头注释.trimEnd(), '正本\t文件\t处数'];
  for (const z of 正本表) {
    const 按文件 = 现状.get(z.id);
    if (!按文件) continue;
    for (const 文件 of [...按文件.keys()].sort()) 行们.push(`${z.id}\t${文件}\t${按文件.get(文件)!.length}`);
  }
  return 行们.join('\n') + '\n';
};

/** 加载正本模块，拿出各个行为认法要比的函数（正本是 three 一类的模块也行：esbuild 打包后在 Node 里执行） */
const 正本函数们 = async (c: 检查上下文, 报: 报告) => {
  const 表 = new Map<正本项, { 函数: 正本函数; 探针: readonly (readonly unknown[])[]; 参数数: number }[]>();
  for (const z of 正本表) {
    if (!z.行为) continue;
    const { 模块, 错误 } = await c.加载(z.位置);
    const 导出 = 模块?.[z.导出];
    if (typeof 导出 !== 'function') {
      报.错(`正本 ${z.id} 加载不了（${z.位置} 的 ${z.导出}）：${错误 ?? '没有这个导出函数'}`, z.位置);
      continue;
    }
    表.set(
      z,
      z.行为.map((r) => ({ 函数: (r.适配 ? r.适配(导出 as never) : 导出) as 正本函数, 探针: r.探针, 参数数: r.探针[0]!.length })),
    );
  }
  return 表;
};

/** 节点外面最近的函数（自己是函数就是自己）；没有就是节点本身 */
const 所在处 = (n: ts.Node): ts.Node => {
  for (let p: ts.Node | undefined = n; p; p = p.parent) if (是函数节点(p)) return p;
  return n;
};

/** 查一个文件：每个正本在这里有几处副本 */
export const 查文件 = (文件: string, 源码: string, 正本们: Awaited<ReturnType<typeof 正本函数们>>): Map<string, 一处[]> => {
  const 表 = new 文件函数(文件, 源码);
  const 处 = new Map<string, Map<ts.Node, 一处>>();
  const 记 = (id: string, n: ts.Node, 一: 一处) => {
    const m = 处.get(id) ?? 处.set(id, new Map()).get(id)!;
    for (let p: ts.Node | undefined = n; p; p = p.parent) if (m.has(p)) return;
    m.set(n, 一);
  };
  for (const f of 表.函数们) {
    const g = 表.编(f);
    const 中 = g ? 正本表.filter((z) => 正本们.get(z)?.some((r) => r.参数数 === f.参数数 && 行为一样(g, r.函数, r.探针))) : [];
    for (const z of 中) 记(z.id, f.节点, { 行: f.行, 名: f.名, 认法: '行为' });
    if (中.length || !f.名) continue;
    // 能按行为比（能求值、有同样参数个数的探针）却不一样的，是同名的别的函数，不算；按行为认出是别的正本的（叫 smoothstep 的 smoothstep01），只算那一个
    for (const z of 正本表) {
      const 能比 = !!g && !!正本们.get(z)?.some((r) => r.参数数 === f.参数数);
      if (z.名字?.includes(f.名) && !能比) 记(z.id, f.节点, { 行: f.行, 名: f.名, 认法: '名字' });
    }
  }
  const 有记号 = 正本表.filter((z) => z.记号);
  遍历(表.sf, (n) => {
    for (const z of 有记号) {
      if (!z.记号!(n, 表.sf)) continue;
      const 在 = 所在处(n);
      记(z.id, 在, { 行: 行号(表.sf, n), 名: 是函数节点(在) ? (表.函数们.find((f) => f.节点 === 在)?.名) : undefined, 认法: '记号' });
    }
  });
  const r = new Map<string, 一处[]>();
  for (const [id, m] of 处) r.set(id, [...m.values()].sort((a, b) => a.行 - b.行));
  return r;
};

/** 要查的文件：engine、库、本作品的渲染代码，去掉正本自己 */
const 要查的 = (c: 检查上下文) => c.本作品文件().filter((p) => 是渲染代码(p) && !正本文件.has(p));

/** 代码里现在的副本（engine、库、本作品） */
export const 现状 = async (c: 检查上下文, 报: 报告): Promise<副本现状> => {
  const 正本们 = await 正本函数们(c, 报);
  const 全 = new Map<string, Map<string, 一处[]>>();
  for (const p of 要查的(c)) {
    for (const [id, 处们] of 查文件(p, c.读(p), 正本们)) (全.get(id) ?? 全.set(id, new Map()).get(id)!).set(p, 处们);
  }
  return 全;
};

export const 正本表路径 = 'pipeline/检查/正本表.ts';

/**
 * 表在 git 里和 main 的分叉点上的样子；拿不到（不在 git、没有 main、那时还没这张表）给 null。
 * 正本们：分叉点的 正本表.ts 里有的 id（读不到给 null，这时每个 id 都当老的，从严）
 */
const 基线 = (c: 检查上下文): { 表: string; 正本们: Set<string> | null } | null => {
  const git = (...a: string[]) => execFileSync('git', ['-C', c.根, '-c', 'core.quotepath=false', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  let 基: string;
  let 表: string;
  try {
    基 = git('merge-base', 'HEAD', 'main').trim();
    表 = git('show', `${基}:${副本表路径}`);
  } catch {
    return null;
  }
  try {
    return { 表, 正本们: new Set([...git('show', `${基}:${正本表路径}`).matchAll(/\bid: '([^']+)'/g)].map((m) => m[1]!)) };
  } catch {
    return { 表, 正本们: null };
  }
};

const 引用写法 = (z: 正本项) => `import { ${z.导出} } from '${z.位置.replace(/^engine\//, '@engine/').replace(/^库\//, '@库/')}'`;
const 说处 = (处们: 一处[]) => 处们.map((x) => `第 ${x.行} 行${x.名 ? ` ${x.名}` : ''}（${x.认法}）`).join('、');

export const 副本 = async (c: 检查上下文, 报: 报告) => {
  if (!c.存在(副本表路径)) return void 报.错(`没有 ${副本表路径}（现有副本的冻结表；没有旧副本也要留表头）`);
  const { 表, 错 } = 读副本表(c.读(副本表路径));
  for (const e of 错) 报.错(e, 副本表路径);
  const 认识 = new Map(正本表.map((z) => [z.id, z]));
  for (const id of 表.keys()) if (!认识.has(id)) 报.错(`正本表里没有 ${id}`, 副本表路径);

  const 码 = await 现状(c, 报);
  const 在查 = (p: string) => /^(engine|库)\//.test(p) || p.startsWith(`${c.作品目录}/`);
  let 登记 = 0;
  for (const z of 正本表) {
    const 代码里 = 码.get(z.id) ?? new Map<string, 一处[]>();
    const 表里 = 表.get(z.id) ?? new Map<string, number>();
    for (const [p, 处们] of 代码里) {
      const 准 = 表里.get(p) ?? 0;
      if (处们.length > 准)
        报.错(`${z.id} 的副本有 ${处们.length} 处（${说处(处们)}），副本表登记 ${准} 处：新代码不再写副本，改成 ${引用写法(z)}`, p, 处们[0]!.行);
      else if (处们.length < 准) 报.错(`${z.id} 的副本现在 ${处们.length} 处，副本表登记 ${准} 处：把 ${副本表路径} 这一行改成 ${处们.length}`, p);
    }
    for (const [p, 准] of 表里) {
      if (!在查(p) || 代码里.has(p)) continue;
      报.错(`副本表登记 ${z.id} 在 ${p} 有 ${准} 处，现在${c.存在(p) ? '没有了' : '文件都没了'}：删掉这一行`, 副本表路径);
    }
    for (const [p, n] of 表里) if (在查(p)) 登记 += n;
  }

  const 基 = 基线(c);
  if (基 === null) 报.信息.push('和 main 的分叉点比不了（不在 git、没有 main，或那时还没有副本表），不查表只减不增');
  else {
    const 旧 = 读副本表(基.表).表;
    const 总 = (m: Map<string, number> | undefined) => [...(m?.values() ?? [])].reduce((a, b) => a + b, 0);
    for (const [id, m] of 表) {
      const [新数, 旧数] = [总(m), 总(旧.get(id))];
      if (新数 <= 旧数) continue;
      if (旧数 === 0 && 基.正本们 && !基.正本们.has(id)) 报.信息.push(`新正本 ${id}：第一次登记 ${新数} 处旧副本`);
      else 报.错(`副本表里 ${id} 从 ${旧数} 处加到 ${新数} 处：表只许减少，新代码改成 import 正本`, 副本表路径);
    }
  }
  报.信息.push(`副本表里 engine、库、${c.作品名} 登记 ${登记} 处旧副本`);
};
