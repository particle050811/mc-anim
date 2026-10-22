// anim extract 的跑和查。每个条目在 <数据根>/run/extract/<名称>/ 里从空目录跑（前置条目先在同一个目录里跑），
// 跑完按产物表逐个比资产锁：sha 一样就放进库（已有不动），不一样只报告、不入库、不改资产锁（锁里是用过的那一版，换版本要人定）。
import fs from 'node:fs';
import path from 'node:path';
import { 配置, 数据路径, isWindows } from '../环境/配置.ts';
import { 跑, 跑出 } from '../环境/子进程.ts';
import { 入库, 字节路径, 文件sha256, 读资产锁, type 资产锁 } from '../资产/资产锁.ts';
import { mcai命令, mcai环境 } from './mcai.ts';
import { 展开步骤, 展开产物, 脚本目录, type 取材条目, type 取材清单, type 展开环境, type 步骤 } from './清单.ts';

export const jar路径 = (q: 取材清单, id: string) => {
  const j = q.jars.get(id);
  if (!j) throw new Error(`jars.toml 里没有 ${id}`);
  return path.join(配置('游戏'), j.到);
};

export const 本机展开 = (q: 取材清单): 展开环境 => ({
  jar路径: (id) => jar路径(q, id),
  prism数据: 配置('prism数据'),
  脚本: 脚本目录(),
  python: 配置('python'),
  mcai: mcai命令(),
});

const 步骤环境 = (): NodeJS.ProcessEnv => ({
  ...mcai环境(),
  ANIM_GAME: 配置('游戏'),
  ANIM_MC_ASSETS: 配置('mc资源'),
  ...(配置('java_home') ? { ANIM_JAVA_HOME: 配置('java_home') } : {}),
});

const 引 = (a: string) => (!a || /[\s'"$`\\|&;<>()*?[\]{}!#~]/.test(a) ? `'${a.replaceAll("'", `'\\''`)}'` : a);
export const 显示 = (argv: 步骤) => argv.map((a) => (typeof a === 'string' ? 引(a) : `$(${a.输出.map(引).join(' ')})`)).join(' ');

export const 暂存目录 = (名称: string) => 数据路径('run', 'extract', 名称);

const 摆输入 = (e: 取材条目, 锁: 资产锁, dir: string) => {
  for (const [id, f] of Object.entries(e.输入)) {
    const 条目 = 锁[id];
    if (!条目) throw new Error(`「${e.名称}」的输入 ${id} 不在资产锁里`);
    const 源 = 字节路径(条目);
    if (!fs.existsSync(源)) throw new Error(`「${e.名称}」的输入 ${id} 的字节不在 ${源}`);
    const 到 = path.join(dir, f);
    fs.mkdirSync(path.dirname(到), { recursive: true });
    fs.copyFileSync(源, 到, fs.constants.COPYFILE_FICLONE);
    fs.chmodSync(到, 0o644);
  }
};

/** 在 dir 里跑一个条目的步骤（前置先跑）；只打印 时只列命令 */
export const 跑步骤 = async (q: 取材清单, e: 取材条目, dir: string, 只打印: boolean, 跑过 = new Set<string>()) => {
  if (跑过.has(e.名称)) return;
  跑过.add(e.名称);
  for (const pre of e.前置) {
    const p = q.条目.get(pre);
    if (!p) throw new Error(`「${e.名称}」的前置「${pre}」不是条目`);
    await 跑步骤(q, p, dir, 只打印, 跑过);
  }
  console.log(`== ${e.名称}`);
  if (e.待迁移) throw new Error(`「${e.名称}」待迁移：${e.待迁移}`);
  if (!e.步骤.length) {
    console.log(`（没有自己的步骤：${e.说明 ?? ''}）`);
    return;
  }
  const v = 本机展开(q);
  if (!只打印) {
    const 缺 = e.需要.filter((i) => !fs.existsSync(jar路径(q, i)));
    if (缺.length) throw new Error(`「${e.名称}」缺 jar：${缺.map((i) => `${i}（${jar路径(q, i)}）`).join('、')}`);
    const 锁 = 读资产锁();
    摆输入(e, 锁, dir);
    // 脚本照旧项目写的，输出目录默认已经在（旧项目里产物就放在那）：先把产物所在的目录建好
    for (const [, f] of 展开产物(e.产物, 锁).对) fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  }
  const env = 步骤环境();
  for (const [i, 原] of e.步骤.entries()) {
    const argv = 展开步骤(q, 原, v);
    if (只打印) {
      console.log(显示(argv));
      continue;
    }
    if (argv[0] === '复制') {
      const [, 源, 到] = argv as string[];
      fs.mkdirSync(path.dirname(path.join(dir, 到!)), { recursive: true });
      fs.copyFileSync(源!, path.join(dir, 到!));
      continue;
    }
    const 实参: string[] = [];
    for (const a of argv) {
      if (typeof a === 'string') 实参.push(a);
      else 实参.push(...跑出(a.输出, { cwd: dir, env }).split(/\s+/).filter(Boolean));
    }
    try {
      await 跑(实参, { cwd: dir, env });
    } catch (err) {
      throw new Error(`「${e.名称}」第 ${i + 1} 步失败：${显示(argv)}\n${(err as Error).message}`);
    }
  }
};

export type 核对结果 = { 一致: string[]; 入库: string[]; 不一致: { id: string; 文件: string; 锁: string; 新: string }[]; 缺文件: { id: string; 文件: string }[]; 未登记: string[]; 空模式: string[] };

const 列文件 = (dir: string): string[] => {
  const out: string[] = [];
  const 走 = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) 走(p);
      else out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  };
  if (fs.existsSync(dir)) 走(dir);
  return out;
};

/** 按条目（含前置）的产物表核对 dir 里的文件，sha 一样的入库 */
export const 核对产物 = (q: 取材清单, es: 取材条目[], dir: string, 锁: 资产锁 = 读资产锁(), 入: boolean = true): 核对结果 => {
  const r: 核对结果 = { 一致: [], 入库: [], 不一致: [], 缺文件: [], 未登记: [], 空模式: [] };
  const 用到 = new Set<string>();
  const 收 = (e: 取材条目, 见过: Set<string>) => {
    if (见过.has(e.名称)) return;
    见过.add(e.名称);
    for (const p of e.前置) 收(q.条目.get(p)!, 见过);
    for (const f of Object.values(e.输入)) 用到.add(f);
    const { 对, 空 } = 展开产物(e.产物, 锁);
    r.空模式.push(...空.map((k) => `${e.名称}：${k}`));
    for (const [id, f] of 对) {
      if (用到.has(f)) continue;
      用到.add(f);
      const 文件 = path.join(dir, f);
      if (!fs.existsSync(文件)) {
        r.缺文件.push({ id, 文件: f });
        continue;
      }
      const sha = 文件sha256(文件);
      const 条目 = 锁[id];
      if (!条目 || 条目.sha256 !== sha) {
        r.不一致.push({ id, 文件: f, 锁: 条目?.sha256 ?? '（锁里没有）', 新: sha });
        continue;
      }
      r.一致.push(id);
      if (入 && !fs.existsSync(字节路径(条目))) {
        入库(文件, 条目.库);
        r.入库.push(id);
      }
    }
  };
  const 见过 = new Set<string>();
  for (const e of es) 收(e, 见过);
  r.未登记 = 列文件(dir).filter((f) => !用到.has(f));
  return r;
};

/** 跑一个条目：清空暂存目录、跑步骤、核对入库 */
export const 提取一条 = async (q: 取材清单, e: 取材条目) => {
  const dir = 暂存目录(e.名称);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await 跑步骤(q, e, dir, false);
  return { dir, 结果: 核对产物(q, [e], dir) };
};

const 找程序 = (名: string): boolean => {
  if (path.isAbsolute(名)) return fs.existsSync(名);
  const 后缀们 = isWindows ? ['', ...(process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')] : [''];
  return (process.env.PATH ?? '').split(path.delimiter).some((d) => d && 后缀们.some((s) => fs.existsSync(path.join(d, 名 + s))));
};

/** --检查：jar、程序、脚本、产物和输入的字节；返回问题列表和待迁移的条目 */
export const 检查 = (q: 取材清单, es: 取材条目[], 校验: boolean, 锁: 资产锁 = 读资产锁()) => {
  const 问题: string[] = [];
  const 待迁移: string[] = [];
  for (const [g, ms] of Object.entries(q.组)) 问题.push(...ms.filter((m) => !q.条目.has(m)).map((m) => `组「${g}」里的「${m}」不是条目`));
  const jar好 = new Map<string, boolean>();
  const v = 本机展开(q);
  for (const e of es) {
    const n = e.名称;
    if (e.公开版 !== '提取' && e.公开版 !== '不提取') 问题.push(`${n}：公开版 要写 "提取" 或 "不提取"`);
    问题.push(...e.前置.filter((p) => !q.条目.has(p)).map((p) => `${n}：前置「${p}」不是条目`));
    // 产物、输入：id 在锁里、字节在库里
    const { 对, 空 } = 展开产物(e.产物, 锁);
    问题.push(...空.map((k) => `${n}：产物 ${k} 在资产锁里一个也没有`));
    for (const [id] of [...对, ...Object.entries(e.输入)]) {
      const 条目 = 锁[id];
      if (!条目) 问题.push(`${n}：${id} 不在资产锁里`);
      else if (!fs.existsSync(字节路径(条目))) 问题.push(`${n}：${id} 的字节不在库里（${字节路径(条目)}）`);
    }
    if (e.待迁移) {
      待迁移.push(`${n}：${e.待迁移}`);
      continue;
    }
    for (const i of e.需要) {
      if (!q.jars.has(i)) {
        问题.push(`${n}：需要的 ${i} 不在 jars.toml 里`);
        continue;
      }
      if (!jar好.has(i)) {
        const p = jar路径(q, i);
        const want = q.jars.get(i)!.sha256;
        const 在 = fs.existsSync(p);
        jar好.set(i, 在 && !(校验 && want && 文件sha256(p) !== want));
        if (!在) 问题.push(`缺 jar：${i}（${p}）`);
        else if (!jar好.get(i)) 问题.push(`jar 的 sha256 和 jars.toml 对不上：${i}（${p}）`);
      }
    }
    for (const 原 of e.步骤) {
      const 用的jar = JSON.stringify(原).match(/\{jar:([^}]+)\}/g) ?? [];
      for (const m of 用的jar) for (const j of m.slice(5, -1).split(',')) if (!e.需要.includes(j)) 问题.push(`${n}：步骤用了 ${j}，需要 里没写`);
      let argv: 步骤;
      try {
        argv = 展开步骤(q, 原, v);
      } catch (err) {
        问题.push(`${n}：${(err as Error).message}`);
        continue;
      }
      for (const cmd of [argv, ...argv.filter((a) => typeof a !== 'string').map((a) => a.输出)]) {
        const head = cmd[0] as string;
        if (head !== '复制' && !找程序(head)) 问题.push(`${n}：找不到程序 ${head}`);
        for (const a of cmd.slice(1)) {
          if (typeof a === 'string' && /^[^\s=]+\.(py|ts|mjs|sh)$/.test(a) && path.isAbsolute(a) && !fs.existsSync(a)) 问题.push(`${n}：脚本不存在 ${a}`);
        }
      }
    }
  }
  return { 问题, 待迁移 };
};
