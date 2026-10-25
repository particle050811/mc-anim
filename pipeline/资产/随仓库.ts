// 随仓库发的字节（用户 10-25 定「这个渲片用到的贴图 音频都放上去」，见 docs/决策/0005-随仓库发字节.md）：
// <作品根>/字节/<sha 前两位>/<sha256> 只放 <作品根>/随仓库.toml 列的段渲片要用的非私有资产（用户点名的范围，不扩大），布局同数据根 store/，按内容寻址。
// 集合按当前代码现算：这些段的 画面、段.ts、设置.ts、作品外壳（和段指纹同一组入口）沿依赖图走到的 asset:，加 cue 里的资产、台词的配音，
// 加 anim film 自己要读的（音效起音；有台词时字幕卡的像素字）。私有的一律不带：私有配乐缺了换静音（资产/私有配乐.ts）。
// 同一个包里别的段（核对段等）import、又不在集合里的字节，公开仓库没有，打包时换成占位（资产/缺字节.ts）。
// anim assets vendor 照它重写 字节/（从数据根 store 拷、逐件核 sha），anim check 核对 字节/ 和集合一致；
// anim render/still/film/studio 开头 补字节：字节/ 里数据根 store/ 还没有的核过 sha 补进去（APFS 克隆，别的文件系统退成普通复制），已有的不动。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 闭包, type 检查上下文 } from '../检查/上下文.ts';
import { 读内容 } from '../检查/内容.ts';
import { 读台词表 } from '../检查/规则/台词.ts';
import { 音效起音资产 } from '../合成/台词落点.ts';
import { 像素字资产 } from '../合成/字幕卡.ts';
import { 提示发布缺 } from './发布锁.ts';
import { 字节路径, type 资产锁, type 锁条目 } from './资产锁.ts';

export const 随仓库表名 = '随仓库.toml';
export const 字节目录名 = '字节';
export const 字节目录 = (作品根: string) => path.join(作品根, 字节目录名);

const 文件sha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sha名 = /^[0-9a-f]{64}$/;

/** 随仓库.toml：段 = [段键或章, …]（章写成字符串，如 "2"） */
export const 读随仓库表 = (文本: string): { 段: string[] } => {
  const doc = parse(文本) as { 段?: unknown };
  if (!Array.isArray(doc.段) || !doc.段.length || doc.段.some((x) => typeof x !== 'string' || !x)) throw new Error(`${随仓库表名} 要写 "段" = ["<段键或章>", …]（章也写成字符串）`);
  return { 段: doc.段 as string[] };
};

export type 随仓库件 = { 条目: 锁条目; ids: string[] };
export type 随仓库集合 = {
  /** sha256 → 锁条目和引用它的 id（几个 id 同一份字节只放一份） */
  件: Map<string, 随仓库件>;
  /** 用到了、但私有不带的 id */
  私有: string[];
  /** 这些段声明的地形包（随仓库不带，挂 Release 的才发，见 资产/发布.ts） */
  地形: string[];
  /** 选中的段键 */
  段们: string[];
  问题: string[];
};

/** 按 随仓库.toml 的段现算要随仓库发的资产（用 anim check 的依赖图和纯模块执行结果） */
export const 算随仓库 = async (c: 检查上下文, 选择器: string[]): Promise<随仓库集合> => {
  const 集合: 随仓库集合 = { 件: new Map(), 私有: [], 段们: [], 地形: [], 问题: [] };
  const 内容 = await 读内容(c);
  if ('错误' in 内容) {
    集合.问题.push(内容.错误);
    return 集合;
  }
  const 图 = await c.依赖图();
  if (图.错误.length) 集合.问题.push(`依赖图不全（打包失败 ${图.错误.length} 处），随仓库的集合算不全，先修好 anim check 的 结构`);
  const 中 = (s: { 键: string; 章: number | '核对' }, x: string) => x === s.键 || x === String(s.章);
  for (const x of 选择器) if (!内容.段们.some((s) => 中(s, x))) 集合.问题.push(`${随仓库表名} 的「${x}」没对上清单里的段（只认段键或章）`);
  const 两锁 = c.资产锁();
  const 锁: 资产锁 = { ...两锁.作品, ...两锁.共用 };
  const 配音 = new Map((读台词表(c) ?? []).map((t) => [t.id, t.配音]));
  const ids = new Set<string>();
  let 有台词 = false;
  for (const s of 内容.段们.filter((s) => 选择器.some((x) => 中(s, x)))) {
    集合.段们.push(s.键);
    if (!s.定义) {
      集合.问题.push(`${s.键}：${s.错误 ?? '段.ts 读不出来'}`);
      continue;
    }
    for (const 名 of s.定义.地形) if (!集合.地形.includes(名)) 集合.地形.push(名);
    const 入口 = [`${s.目录}/画面.tsx`, s.段文件, 'engine/段/设置.ts', c.作品路径('index.ts'), ...(s.定义.叠层 ?? []).map((l) => `${s.目录}/${l.入口}`)];
    for (const f of 闭包(图, 入口.filter((p) => 图.边.has(p)))) for (const id of 图.资产.get(f) ?? []) ids.add(id);
    for (const cue of s.定义.声音 ?? []) {
      if (cue.资产 !== undefined) ids.add(cue.资产);
      else {
        有台词 = true;
        const id = 配音.get(cue.台词);
        if (id) ids.add(id);
      }
    }
  }
  // anim film 自己读的：没登记就是这部作品不用（读音效起音 缺了按 0 算）
  for (const id of [音效起音资产, ...(有台词 ? [像素字资产] : [])]) if (锁[id]) ids.add(id);
  集合.地形.sort();
  for (const id of [...ids].sort()) {
    const 条目 = 锁[id];
    if (!条目) {
      集合.问题.push(`「${id}」不在资产锁里`);
      continue;
    }
    if (条目.库 === '私有') {
      集合.私有.push(id);
      continue;
    }
    const 已 = 集合.件.get(条目.sha256);
    if (已) 已.ids.push(id);
    else 集合.件.set(条目.sha256, { 条目, ids: [id] });
  }
  return 集合;
};

/** 字节/ 下现有的文件：相对 字节/ 的正斜杠路径 → 绝对路径 */
const 现有字节 = (dir: string): Map<string, string> => {
  const out = new Map<string, string>();
  const 走 = (rel: string[]) => {
    for (const e of fs.readdirSync(path.join(dir, ...rel), { withFileTypes: true })) {
      if (e.isDirectory()) 走([...rel, e.name]);
      else out.set([...rel, e.name].join('/'), path.join(dir, ...rel, e.name));
    }
  };
  if (fs.existsSync(dir)) 走([]);
  return out;
};

/** 字节/ 里一件该在的相对路径 */
export const 字节相对路径 = (sha: string) => `${sha.slice(0, 2)}/${sha}`;

export type 比对结果 = { 添: string[]; 改: string[]; 删: string[]; 件数: number; 大小: number };

/** 字节/ 和集合比：缺的（添）、内容和文件名对不上的（改）、多余或放错位置的（删），都是相对 字节/ 的正斜杠路径 */
export const 比对字节 = (集合: 随仓库集合, 作品根: string): 比对结果 => {
  const dir = 字节目录(作品根);
  const 有 = 现有字节(dir);
  const r: 比对结果 = { 添: [], 改: [], 删: [], 件数: 集合.件.size, 大小: 0 };
  for (const [sha, { 条目 }] of 集合.件) {
    r.大小 += 条目.大小;
    const rel = 字节相对路径(sha);
    if (!有.has(rel)) r.添.push(rel);
    else if (文件sha(有.get(rel)!) !== sha) r.改.push(rel);
  }
  for (const rel of 有.keys()) {
    const m = /^([0-9a-f]{2})\/([0-9a-f]{64})$/.exec(rel);
    if (!m || !集合.件.has(m[2]!) || m[1] !== m[2]!.slice(0, 2)) r.删.push(rel);
  }
  return r;
};

/**
 * 照集合重写 <作品根>/字节/：缺的从数据根 store 拷（先核 store 里那份的 sha），内容不对的重拷，多余的删掉。
 * 只查 = true 时不写，只返回要做的改动。数据根里缺字节就报错，列出全部缺的。
 */
export const 写随仓库 = (集合: 随仓库集合, 作品根: string, 根: string, 只查 = false): 比对结果 => {
  const dir = 字节目录(作品根);
  const r = 比对字节(集合, 作品根);
  if (只查) return r;
  const 缺源: string[] = [];
  const 要拷: { 源: string; 目标: string }[] = [];
  for (const rel of [...r.添, ...r.改]) {
    const sha = rel.split('/')[1]!;
    const { 条目, ids } = 集合.件.get(sha)!;
    const 源 = 字节路径(条目, 根);
    if (!fs.existsSync(源)) {
      缺源.push(`${ids.join('、')}（${源}）`);
      continue;
    }
    const 实 = 文件sha(源);
    if (实 !== sha) throw new Error(`数据根里 ${ids.join('、')} 的字节 ${源} sha256 是 ${实.slice(0, 12)}，资产锁记的是 ${sha.slice(0, 12)}（anim check --深 查一遍数据根）`);
    要拷.push({ 源, 目标: path.join(dir, ...rel.split('/')) });
  }
  if (缺源.length) throw new Error(`数据根里缺这些资产的字节，拷不进 字节/：\n  ${缺源.join('\n  ')}`);
  for (const { 源, 目标 } of 要拷) {
    fs.mkdirSync(path.dirname(目标), { recursive: true });
    const tmp = `${目标}.写入中-${process.pid}`;
    try {
      fs.copyFileSync(源, tmp, fs.constants.COPYFILE_FICLONE);
      // 库里是只读的；进 Git 的文件照常可写（Windows 上改名盖不掉只读文件）
      fs.chmodSync(tmp, 0o644);
      fs.renameSync(tmp, 目标);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  for (const rel of r.删) fs.rmSync(path.join(dir, ...rel.split('/')), { force: true });
  // 删空了的子目录
  if (fs.existsSync(dir)) for (const d of fs.readdirSync(dir)) if (fs.statSync(path.join(dir, d)).isDirectory() && !fs.readdirSync(path.join(dir, d)).length) fs.rmdirSync(path.join(dir, d));
  return r;
};

export type 补字节结果 = { 补: number; 共: number };

/**
 * 把 <作品根>/字节/ 里数据根 store/ 还没有的补进去：先核文件内容的 sha256 和文件名一致，不一致就报错（字节/ 被改坏或换行被改了）。
 * store 只增不改：已有的不动、不重核（anim check --深 核数据根）。先写临时名再改名，几个命令同时补也不会留下半个文件。
 */
export const 补字节 = (作品根: string, 根: string): 补字节结果 => {
  const dir = 字节目录(作品根);
  const r: 补字节结果 = { 补: 0, 共: 0 };
  const 件们 = [...现有字节(dir)];
  for (const [rel, 源] of 件们) {
    const [前, 名, ...多] = rel.split('/');
    if (多.length || !名 || !sha名.test(名) || 前 !== 名.slice(0, 2)) throw new Error(`${源}：${字节目录名}/ 里只放 <sha 前两位>/<sha256>（anim assets vendor 重写一遍）`);
  }
  for (const [rel, 源] of 件们) {
    const [前, 名] = rel.split('/') as [string, string];
    r.共++;
    const 目标 = path.join(根, 'store', 前, 名);
    if (fs.existsSync(目标)) continue;
    const 实 = 文件sha(源);
    if (实 !== 名) throw new Error(`${源} 的内容 sha256 是 ${实.slice(0, 12)}，和文件名对不上（字节/ 被改过？git 要按二进制检出，见 .gitattributes；或重新 clone）`);
    fs.mkdirSync(path.dirname(目标), { recursive: true });
    const tmp = `${目标}.写入中-${process.pid}`;
    try {
      fs.copyFileSync(源, tmp, fs.constants.COPYFILE_FICLONE);
      fs.chmodSync(tmp, 0o444);
      try {
        fs.renameSync(tmp, 目标);
      } catch (e) {
        // 别的命令同时补进了同一份（Windows 上改名盖不掉已有的只读文件）：内容寻址，有了就行
        if (!fs.existsSync(目标)) throw e;
      }
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    r.补++;
  }
  return r;
};

/** 补字节，补了才打一行；挂 Release 发的还没下，提示 anim assets pull */
export const 补字节并报 = (作品根: string, 根: string) => {
  const r = 补字节(作品根, 根);
  提示发布缺(作品根, 根);
  if (r.补) console.log(`从 ${path.relative(process.cwd(), 字节目录(作品根)) || 字节目录(作品根)} 补了 ${r.补} 件字节进 ${path.join(根, 'store')}（共 ${r.共} 件，其余已有）`);
  return r;
};
