// anim cues 的核心：给段框架做的段（窗口段.ts 的 框架 标记）生成本段目录下两份文件，都进 Git、不手改：
//   声音表.生成.ts   纯数据：本段 cue 用到的音频的时长、峰值、响度，台词的配音、开口、时长。段.ts 交给 窗口段，放() 按它算默认帧数和增益
//   声音地址.生成.ts 资产 id → 打包后的地址（asset: import；私有配乐走 engine/audio/私有配乐.ts 现取）再带上声音表。画面.tsx 交给 定义画面
// 按段分开生成：一段只依赖自己用到的那几个声音，加一声不让别的段过期（全作品一张大表的话，加一声全部过期）。
// 生成要先执行 段.ts 才知道用到哪些声音，可 放() 又要表里的数：所以先在「收集」模式下执行一遍（要过的 id 都记下，表里没有的给占位），量完写表，再正常执行一遍取最终 cue。
// 每次执行都用 esbuild 连依赖打成一个新的临时文件再 import，不吃 Node 的模块缓存（同 检查/上下文.ts 的 加载）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { 开始收集, 结束收集, type 声音表, type 表里音频数, type 音频数, type 台词数 } from '../../engine/段/声音助手.ts';
import type { 段定义 } from '../../engine/段/段定义.ts';
import { 是框架段 } from '../../engine/段/窗口段.ts';
import { esbuild别名插件, 非代码loader } from '../资产/esbuild插件.ts';
import { 是私有配乐 } from '../资产/私有配乐.ts';
import type { 资产锁, 锁条目 } from '../资产/资产锁.ts';
import { 已知音频数 } from './音频数.ts';
import { 台词头们, 开口表 } from '../合成/台词落点.ts';

export const 声音表文件 = '声音表.生成.ts';
export const 声音地址文件 = '声音地址.生成.ts';

/** 台词.toml 的一条里生成要用的字段 */
export type 台词行 = { id: string; 配音?: string; 开口?: number };

/** 在 Node 里执行一个纯模块，拿默认导出；每次都是新打的一份 */
export const 新鲜执行 = async (文件: string, 根: string): Promise<Record<string, unknown>> => {
  let out;
  try {
    out = await build({
      entryPoints: [文件],
      absWorkingDir: 根,
      bundle: true,
      write: false,
      platform: 'node',
      format: 'esm',
      jsx: 'automatic',
      loader: { ...非代码loader, '.json': 'json' },
      plugins: [esbuild别名插件(根)],
      logLevel: 'silent',
    });
  } catch (e) {
    const errs = (e as { errors?: { text: string; location?: { file: string; line: number } | null }[] }).errors;
    throw new Error(errs?.length ? errs.map((x) => (x.location ? `${x.location.file}:${x.location.line}：${x.text}` : x.text)).join('；') : String(e));
  }
  const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-cues-'));
  try {
    const f = path.join(目录, 'm.mjs');
    fs.writeFileSync(f, out.outputFiles[0]!.text, 'utf8');
    return (await import(pathToFileURL(f).href)) as Record<string, unknown>;
  } finally {
    fs.rmSync(目录, { recursive: true, force: true });
  }
};

const 执行段 = async (段文件: string, 根: string): Promise<段定义> => {
  const m = await 新鲜执行(段文件, 根);
  if (!m.default) throw new Error(`${段文件} 没有 export default`);
  return m.default as 段定义;
};

/** 收集模式执行：要过数的 id 都记下来（表里没有的不报错） */
export const 收集执行 = async (段文件: string, 根: string): Promise<{ 段: 段定义; 要过: Set<string> }> => {
  const 要过 = 开始收集();
  try {
    return { 段: await 执行段(段文件, 根), 要过 };
  } finally {
    结束收集();
  }
};

/** cue 里引到的资产 id 和台词 id（按出现顺序去重） */
export const cue引用 = (段: Pick<段定义, '声音'>) => {
  const 资产 = new Set<string>();
  const 台词 = new Set<string>();
  for (const c of 段.声音 ?? []) {
    if (c.台词 !== undefined) 台词.add(c.台词);
    else 资产.add(c.资产);
  }
  return { 资产, 台词 };
};

export type 生成环境 = {
  锁: 资产锁;
  台词表: readonly 台词行[];
  /** 一件音频的数（锁里的、缓存的或现量的） */
  取数: (id: string) => 音频数;
  /** 清单里本段的上一段（核对段不算），只在本段有跨段的 接上段 台词时才要 */
  上一段?: () => Promise<段定义 | undefined>;
};

/** 声音表里记的字节标识：锁里 sha256 的前 12 位 */
export const 短sha = (条目: 锁条目) => 条目.sha256.slice(0, 12);

/** 盘上声音表里这件的数，字节没换（sha 和锁对得上）才算 */
const 盘上的数 = (盘上: 声音表 | undefined, id: string, 条目: 锁条目): 音频数 | undefined => {
  const x = 盘上?.资产[id];
  if (!x || x.sha !== 短sha(条目)) return undefined;
  const { sha: _, ...数 } = x;
  return 数;
};

/**
 * 按段的 cue（和收集时要过数的 id）算声音表。一件的数先用锁里的，再用盘上声音表里 sha 对得上的（换机器重跑不重量，
 * 免得 ffmpeg 版本不同量出差 0.01 的数、改了生成的文件），最后才 环境.取数（缓存或现量）。
 */
export const 算声音表 = async (段: 段定义, 额外资产: Iterable<string>, 环境: 生成环境, 盘上?: 声音表): Promise<声音表> => {
  const { 资产, 台词 } = cue引用(段);
  const 台词条 = new Map(环境.台词表.map((t) => [t.id, t]));
  const 台词们: Record<string, 台词数> = {};
  const 要数 = new Set([...资产, ...额外资产]);
  // 跨段的接上段：本段在它开口之前就有 接上段 的那几句
  const 先接 = new Set<string>();
  const 开过 = new Set<string>();
  for (const c of 段.声音 ?? []) {
    if (c.台词 === undefined) continue;
    if (c.接上段 && !开过.has(c.台词)) 先接.add(c.台词);
    if (!c.接上段) 开过.add(c.台词);
  }
  let 上段开口: Map<string, number> | undefined;
  if (先接.size) {
    const 上 = await 环境.上一段?.();
    if (!上) throw new Error(`${[...先接].join('、')} 标了 接上段，清单里没有上一段`);
    const 开口 = 开口表(环境.台词表.map((t) => ({ 角色: '', 文本: '', ...t })));
    上段开口 = new Map(台词头们(上, 开口, undefined, false).map((x) => [x.cue.台词, x.开口帧 - 上.帧数]));
  }
  for (const id of [...台词].sort()) {
    const t = 台词条.get(id);
    if (!t) throw new Error(`台词「${id}」不在作品的 台词.toml 里`);
    if (!t.配音) throw new Error(`台词「${id}」还没配音（台词.toml 没写 配音），放不了`);
    要数.add(t.配音);
    const 上段开口帧 = 先接.has(id) ? 上段开口?.get(id) : undefined;
    if (先接.has(id) && 上段开口帧 === undefined) throw new Error(`台词「${id}」标了 接上段，清单里上一段没有它开口`);
    台词们[id] = { 配音: t.配音, 开口: t.开口 ?? 0, 时长: 0, ...(上段开口帧 !== undefined ? { 上段开口帧 } : {}) };
  }
  const 资产们: Record<string, 表里音频数> = {};
  for (const id of [...要数].sort()) {
    const 条目 = 环境.锁[id];
    if (!条目) throw new Error(`资产锁里没有「${id}」：先在资产表登记、anim assets add 入库`);
    资产们[id] = { ...(已知音频数(条目) ?? 盘上的数(盘上, id, 条目) ?? 环境.取数(id)), sha: 短sha(条目) };
  }
  for (const t of Object.values(台词们)) t.时长 = 资产们[t.配音]!.时长;
  return { 资产: 资产们, 台词: 台词们 };
};

const 文件头 = '// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。';

export const 声音表文本 = (表: 声音表) =>
  `${文件头}\n// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。\n` +
  `import type { 声音表 } from '@engine/段/声音助手.ts';\n\nconst 表: 声音表 = ${JSON.stringify(表, null, 2)};\nexport default 表;\n`;

/** 本段要放的文件：资产 cue 的资产、台词的配音 */
export const 要放的文件 = (段: 段定义, 表: 声音表): string[] => {
  const { 资产, 台词 } = cue引用(段);
  const s = new Set(资产);
  for (const id of 台词) {
    const t = 表.台词[id];
    if (!t) throw new Error(`声音表里没有台词「${id}」`);
    s.add(t.配音);
  }
  return [...s].sort();
};

export const 声音地址文本 = (文件们: readonly string[], 锁: 资产锁) => {
  const 私有 = 文件们.filter((id) => 是私有配乐(id, 锁));
  const 打包 = 文件们.filter((id) => !是私有配乐(id, 锁));
  const 行: string[] = [
    文件头,
    '// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。',
    "import type { 声音地址 } from '@engine/段/段画面.tsx';",
    ...(私有.length ? ["import { 私有配乐 } from '@engine/audio/私有配乐.ts';"] : []),
    "import 表 from './声音表.生成.ts';",
    ...打包.map((id, i) => `import 声${i} from ${JSON.stringify(`asset:${id}`)};`),
    '',
    'const 声音: 声音地址 = {',
    '  地址: {',
    ...文件们.map((id) => `    ${JSON.stringify(id)}: ${私有.includes(id) ? `私有配乐(${JSON.stringify(id)})` : `声${打包.indexOf(id)}`},`),
    '  },',
    '  表,',
    '};',
    'export default 声音;',
    '',
  ];
  return 行.join('\n');
};

export type 一段结果 = { 段: 段定义; 表: 声音表; 改了: string[] };

const 写如果变 = (文件: string, 文本: string): boolean => {
  if (fs.existsSync(文件) && fs.readFileSync(文件, 'utf8') === 文本) return false;
  fs.writeFileSync(文件, 文本, 'utf8');
  return true;
};

/** 生成一段的两份文件（变了才写），返回最终的段和改了哪几份 */
export const 生成一段 = async (段文件: string, 根: string, 环境: 生成环境): Promise<一段结果> => {
  const 目录 = path.dirname(段文件);
  const 表位 = path.join(目录, 声音表文件);
  const 改了: string[] = [];
  // 第一次生成时 段.ts import 的表还不存在：先放一张空的
  const 新建 = !fs.existsSync(表位);
  if (新建 && 写如果变(表位, 声音表文本({ 资产: {}, 台词: {} }))) 改了.push(声音表文件);
  const 盘上 = 新建 ? undefined : ((await 新鲜执行(表位, 根)).default as 声音表);
  const 收 = await 收集执行(段文件, 根);
  if (!是框架段(收.段)) {
    if (新建) fs.rmSync(表位);
    throw new Error(`${段文件} 不是段框架的段（默认导出不是 窗口段 做的），anim cues 不管它`);
  }
  const 表 = await 算声音表(收.段, 收.要过, 环境, 盘上);
  if (写如果变(表位, 声音表文本(表)) && !改了.includes(声音表文件)) 改了.push(声音表文件);
  const 段 = await 执行段(段文件, 根);
  // 正常执行的 cue 要放的文件都得在表里；段.ts 要是按声音的数分了支、用到收集时没碰到的声音，这里会缺
  const 缺 = 要放的文件(段, 表).filter((id) => !(id in 表.资产));
  if (缺.length) throw new Error(`${段文件}：正常执行用到了收集时没碰到的声音 ${缺.join('、')}（段.ts 按声音的数分了支？），再跑一次 anim cues`);
  if (写如果变(path.join(目录, 声音地址文件), 声音地址文本(要放的文件(段, 表), 环境.锁))) 改了.push(声音地址文件);
  return { 段, 表, 改了 };
};

/**
 * 核对（anim check、anim cues --检查 用，不写文件、不量音频）：照段现在的 cue 算出两份文件该是什么样，和盘上的比。
 * 数先取锁里的，再取盘上声音表里 sha 对得上的，最后 取数（缓存）；都没有（新加的声音、字节换了）就报。返回问题列表，空 = 对得上。
 */
export const 核对一段 = async (段: 段定义, 目录: string, 根: string, 环境: Omit<生成环境, '取数'> & { 取数: (id: string) => 音频数 | undefined }): Promise<string[]> => {
  const 表位 = path.join(目录, 声音表文件);
  const 地址位 = path.join(目录, 声音地址文件);
  if (!fs.existsSync(表位) || !fs.existsSync(地址位)) return [`缺 ${声音表文件} 或 ${声音地址文件}：跑 anim cues`];
  const 盘上 = (await 新鲜执行(表位, 根)).default as 声音表;
  let 该是: 声音表;
  try {
    该是 = await 算声音表(
      段,
      [],
      {
        ...环境,
        取数: (id) => {
          const x = 环境.取数(id);
          if (x) return x;
          const 旧 = 盘上.资产[id];
          throw new Error(旧 ? `「${id}」的字节换了（锁里 sha ${短sha(环境.锁[id]!)}，声音表里 ${旧.sha ?? '没记'}）` : `声音表里没有「${id}」`);
        },
      },
      盘上,
    );
  } catch (e) {
    return [`${(e as Error).message}：跑 anim cues`];
  }
  const 问题: string[] = [];
  // 收集模式下 放() 要过的、最后没进 cue 的 id 允许留在表里：只比 cue 用到的那些
  const 盘上比 = { 资产: Object.fromEntries(Object.keys(该是.资产).map((k) => [k, 盘上.资产[k]])), 台词: 盘上.台词 };
  if (JSON.stringify(盘上比) !== JSON.stringify(该是)) 问题.push(`${声音表文件} 和 段.ts 的 cue 对不上（加减了声音、改了台词表或锁里的数）：跑 anim cues`);
  if (fs.readFileSync(地址位, 'utf8') !== 声音地址文本(要放的文件(段, 该是), 环境.锁)) 问题.push(`${声音地址文件} 和 段.ts 的 cue 对不上：跑 anim cues`);
  return 问题;
};
