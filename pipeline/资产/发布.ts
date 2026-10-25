// 挂 GitHub Release 发字节（用户 10-25「地形太大了 放 release」「应力转动所有素材都公开」，见 docs/决策/0006-挂Release发字节.md）：
// <作品根>/随发布.toml 写 仓库、标签、段；anim assets pack 照它现算要发的字节（随仓库.ts 的 算随仓库，和随仓库发同一个集合）和这些段声明的地形包，
// 在 <数据根>/cache/发布/ 打成 tar、写 <作品根>/发布锁.json；--上传 用 gh 建 Release、传还没传的附件。anim assets pull 按发布锁下载、核 sha、解进数据根。
// 附件名只用 ASCII（GitHub 会改掉非 ASCII 的附件名）、按内容取：字节 bytes-<sha 列表的 sha 前 12 位>.tar，地形 terrain-<版本>.tar。内容变了名字跟着变，
// 旧附件留在 Release 上，和 store/ 一样只增不改；tar 每次打出来字节都不同（时间戳），所以发布锁里已有的同名附件不重打。
// 下载用系统的 curl、解包用系统的 tar（Windows 10 起自带 curl.exe 和 bsdtar），代理认 HTTPS_PROXY 这类环境变量。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import type { 检查上下文 } from '../检查/上下文.ts';
import { 包清单 } from '../检查/规则/资产.ts';
import { 代码根 } from '../环境/路径.ts';
import { 跑, 试跑 } from '../环境/子进程.ts';
import { 算随仓库 } from './随仓库.ts';
import { 地形目录, 读发布锁, 附件缺, type 发布锁, type 附件 } from './发布锁.ts';

export const 随发布表名 = '随发布.toml';
export type 随发布表 = { 仓库: string; 标签: string; 段: string[] };

/** GitHub 一个 Release 附件要小于 2 GiB */
export const 附件上限 = 2 * 1024 ** 3;

/** 随发布.toml：仓库 = "<owner>/<repo>"，标签 = "<tag>"，段 = [段键或章, …]（章写成字符串） */
export const 读随发布表 = (文本: string): 随发布表 => {
  const d = parse(文本) as Record<string, unknown>;
  const 格式 = `${随发布表名} 要写 "仓库" = "<owner>/<repo>"、"标签" = "<tag>"、"段" = ["<段键或章>", …]`;
  if (typeof d.仓库 !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(d.仓库)) throw new Error(格式);
  if (typeof d.标签 !== 'string' || !/^[\x21-\x7e]+$/.test(d.标签)) throw new Error(`${格式}（标签只用 ASCII）`);
  if (!Array.isArray(d.段) || !d.段.length || d.段.some((x) => typeof x !== 'string' || !x)) throw new Error(格式);
  return { 仓库: d.仓库, 标签: d.标签, 段: d.段 as string[] };
};

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const 字节附件名 = (shas: readonly string[]) => `bytes-${sha(shas.join('\n')).slice(0, 12)}.tar`;
export const 地形附件名 = (版本: string) => `terrain-${版本}.tar`;

const 流sha = (f: string) =>
  new Promise<string>((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(f)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });

type 地形登记 = { 版本: string; 清单sha256?: string; 文件数?: number; 大小?: number };
const 读地形表 = (): Record<string, 地形登记> =>
  (JSON.parse(fs.readFileSync(path.join(代码根(), 'assets', '地形版本.json'), 'utf8')) as { 包?: Record<string, 地形登记> }).包 ?? {};

export type 应发 = { 字节: string[]; 地形: { 包: string; 版本: string }[]; 段数: number; 私有: string[]; 问题: string[] };

/** 按当前代码算这一版该发什么：随仓库同一个集合的 store 字节（私有的不发），加段声明的地形包 */
export const 算应发 = async (c: 检查上下文, 表: 随发布表): Promise<应发> => {
  const 集合 = await 算随仓库(c, 表.段);
  const 地形表 = 读地形表();
  const 问题 = [...集合.问题];
  const 地形 = 集合.地形.flatMap((包) => {
    const v = 地形表[包];
    if (!v) {
      问题.push(`地形包 ${包} 没在 assets/地形版本.json 登记`);
      return [];
    }
    return [{ 包, 版本: v.版本 }];
  });
  return { 字节: [...集合.件.keys()].sort(), 地形, 段数: 集合.段们.length, 私有: 集合.私有, 问题 };
};

/** 发布锁和现算的对不上的地方（anim check 用）；空就是一致 */
export const 比对发布锁 = (锁: 发布锁 | undefined, 应: 应发, 表: 随发布表): string[] => {
  if (!锁) return ['没有 发布锁.json'];
  const r: string[] = [];
  if (锁.仓库 !== 表.仓库 || 锁.标签 !== 表.标签) r.push(`发布锁是 ${锁.仓库}@${锁.标签}，${随发布表名} 写的是 ${表.仓库}@${表.标签}`);
  const 有 = new Set(锁.附件.flatMap((a) => a.字节 ?? []));
  const 缺 = 应.字节.filter((s) => !有.has(s));
  const 多 = [...有].filter((s) => !应.字节.includes(s));
  if (缺.length) r.push(`发布锁少 ${缺.length} 件字节`);
  if (多.length) r.push(`发布锁多 ${多.length} 件字节（段现在用不到）`);
  const 要名 = [字节附件名(应.字节), ...应.地形.map((x) => 地形附件名(x.版本))].sort();
  const 锁名 = 锁.附件.map((a) => a.名).sort();
  if (要名.join() !== 锁名.join()) r.push(`附件该是 ${要名.join('、')}，发布锁里是 ${锁名.join('、')}`);
  return r;
};

/** tar 一批相对 基 的路径（列表文件给 -T）；Mac 上不带 ._ 扩展属性文件 */
const 打tar = async (出: string, 基: string, 列表: string[]) => {
  const 表 = `${出}.列表`;
  fs.writeFileSync(表, 列表.join('\n') + '\n', 'utf8');
  const tmp = `${出}.写入中-${process.pid}`;
  try {
    const mac = process.platform === 'darwin' ? ['--no-mac-metadata'] : [];
    await 跑(['tar', ...mac, '--format', 'pax', '-cf', tmp, '-C', 基, '-T', 表], { env: { ...process.env, COPYFILE_DISABLE: '1' }, 安静: true });
    fs.renameSync(tmp, 出);
  } finally {
    fs.rmSync(表, { force: true });
    fs.rmSync(tmp, { force: true });
  }
  const 大小 = fs.statSync(出).size;
  if (大小 >= 附件上限) throw new Error(`${出} 有 ${(大小 / 1e9).toFixed(2)} GB，超过 GitHub 附件上限 2 GiB（要分卷，还没做）`);
  return { sha256: await 流sha(出), 大小 };
};

export const 发布目录 = (根: string) => path.join(根, 'cache', '发布');

/** anim assets pack：现算该发的，锁里没有的打成 tar，写发布锁；返回新锁和这次新打的附件（本机文件路径） */
export const 打包发布 = async (c: 检查上下文, 表: 随发布表, 作品根: string, 根: string) => {
  const 应 = await 算应发(c, 表);
  if (应.问题.length) throw new Error(`算不出该发的：\n  ${应.问题.join('\n  ')}`);
  const 旧 = 读发布锁(作品根);
  const 旧附件 = new Map(旧 && 旧.仓库 === 表.仓库 && 旧.标签 === 表.标签 ? 旧.附件.map((a) => [a.名, a]) : []);
  const dir = 发布目录(根);
  fs.mkdirSync(dir, { recursive: true });
  const 附件们: 附件[] = [];
  const 新打: string[] = [];

  const 字节名 = 字节附件名(应.字节);
  const 旧字节 = 旧附件.get(字节名);
  if (旧字节) 附件们.push(旧字节);
  else {
    const 列表 = 应.字节.map((s) => `store/${s.slice(0, 2)}/${s}`);
    const 缺 = 列表.filter((p) => !fs.existsSync(path.join(根, p)));
    if (缺.length) throw new Error(`数据根缺 ${缺.length} 件要发的字节（${缺.slice(0, 3).join('、')}…），这台机器打不了`);
    const 出 = path.join(dir, 字节名);
    console.log(`打 ${字节名}：${应.字节.length} 件字节`);
    附件们.push({ 名: 字节名, ...(await 打tar(出, 根, 列表)), 字节: 应.字节 });
    新打.push(出);
  }

  const 地形表 = 读地形表();
  for (const { 包, 版本 } of 应.地形) {
    const 名 = 地形附件名(版本);
    const 旧地形 = 旧附件.get(名);
    if (旧地形) {
      附件们.push(旧地形);
      continue;
    }
    const 源 = 地形目录(根, 包, 版本);
    if (!fs.existsSync(源)) throw new Error(`数据根没有地形包 ${包}/${版本}，这台机器打不了`);
    const 实 = await 包清单(源);
    const v = 地形表[包]!;
    if (实.清单sha256 !== v.清单sha256) throw new Error(`地形包 ${包}/${版本} 和 assets/地形版本.json 记的清单指纹不一致，先 anim check --深`);
    const 出 = path.join(dir, 名);
    console.log(`打 ${名}：地形包 ${包}，${实.文件数} 个文件 ${(实.大小 / 1e9).toFixed(2)} GB`);
    const 文件 = fs.readdirSync(源).sort();
    附件们.push({ 名, ...(await 打tar(出, 源, 文件)), 地形: { 包, 版本 } });
    新打.push(出);
  }
  return { 锁: { 仓库: 表.仓库, 标签: 表.标签, 附件: 附件们 } satisfies 发布锁, 新打, 应 };
};

/** --上传：没有这个 Release 就建，再传 Release 上还没有的附件（本机 cache/发布/ 里要有） */
export const 上传发布 = async (锁: 发布锁, 根: string) => {
  const 看 = 试跑(['gh', 'release', 'view', 锁.标签, '--repo', 锁.仓库, '--json', 'assets', '--jq', '.assets[].name']);
  if (看.退出码 !== 0) {
    if (!/release not found/i.test(看.stderr)) throw new Error(`gh release view 失败（装了 gh、gh auth login 了吗）：${看.stderr.trim()}`);
    await 跑(['gh', 'release', 'create', 锁.标签, '--repo', 锁.仓库, '--title', 锁.标签, '--notes', '渲片用的字节和地形包，anim assets pull 按 <作品根>/发布锁.json 下载、核 sha、解进数据根。']);
  }
  const 已有 = new Set(看.退出码 === 0 ? 看.stdout.split('\n').filter(Boolean) : []);
  for (const a of 锁.附件) {
    if (已有.has(a.名)) continue;
    const f = path.join(发布目录(根), a.名);
    if (!fs.existsSync(f) || fs.statSync(f).size !== a.大小) throw new Error(`${a.名} 不在 ${发布目录(根)}（或大小不对），这台机器传不了`);
    console.log(`传 ${a.名}（${(a.大小 / 1e6).toFixed(0)} MB）`);
    await 跑(['gh', 'release', 'upload', 锁.标签, f, '--repo', 锁.仓库]);
  }
};

/** 字节搬进 store/：核 sha、只读、先临时名再改名；已有的不动 */
const 放进store = (源: string, 根: string, s: string) => {
  const 目标 = path.join(根, 'store', s.slice(0, 2), s);
  if (fs.existsSync(目标)) return false;
  fs.mkdirSync(path.dirname(目标), { recursive: true });
  fs.chmodSync(源, 0o444);
  try {
    fs.renameSync(源, 目标);
  } catch (e) {
    if (!fs.existsSync(目标)) throw e;
  }
  return true;
};

/** anim assets pull：按发布锁把数据根还缺的附件下载、核 sha、解进去；下完的 tar 删掉 */
export const 拉发布 = async (锁: 发布锁, 根: string) => {
  const 要 = 锁.附件.filter((a) => 附件缺(a, 根) > 0);
  if (!要.length) {
    console.log(`${锁.附件.length} 个附件的东西数据根里都有`);
    return;
  }
  console.log(`要下 ${要.length} 个附件，共 ${(要.reduce((s, a) => s + a.大小, 0) / 1e9).toFixed(2)} GB（${锁.仓库} 的 Release ${锁.标签}）`);
  const dir = 发布目录(根);
  fs.mkdirSync(dir, { recursive: true });
  const 地形表 = 读地形表();
  for (const a of 要) {
    const f = path.join(dir, a.名);
    if (!(fs.existsSync(f) && fs.statSync(f).size === a.大小 && (await 流sha(f)) === a.sha256)) {
      const url = `https://github.com/${锁.仓库}/releases/download/${encodeURIComponent(锁.标签)}/${encodeURIComponent(a.名)}`;
      console.log(`下 ${a.名}（${(a.大小 / 1e6).toFixed(0)} MB）`);
      const tmp = `${f}.下载中`;
      // -C - 断点续传：上回没下完的接着下
      await 跑(['curl', '-fL', '--retry', '3', '-C', '-', '-o', tmp, url]);
      const 实 = await 流sha(tmp);
      if (实 !== a.sha256) {
        fs.rmSync(tmp, { force: true });
        throw new Error(`${a.名} 下下来的 sha256 是 ${实.slice(0, 12)}，发布锁记的是 ${a.sha256.slice(0, 12)}（Release 上的附件被换过？重跑一次）`);
      }
      fs.renameSync(tmp, f);
    }
    const 解 = path.join(dir, `解开-${a.名}-${process.pid}`);
    fs.rmSync(解, { recursive: true, force: true });
    fs.mkdirSync(解, { recursive: true });
    try {
      await 跑(['tar', '-xf', f, '-C', 解], { 安静: true });
      if (a.地形) {
        const { 包, 版本 } = a.地形;
        const v = 地形表[包];
        const 实 = await 包清单(解);
        if (!v || 实.清单sha256 !== v.清单sha256 || 实.文件数 !== v.文件数 || 实.大小 !== v.大小) throw new Error(`${a.名} 解开的地形包 ${包}/${版本} 和 assets/地形版本.json 记的不一致`);
        const 目标 = 地形目录(根, 包, 版本);
        fs.mkdirSync(path.dirname(目标), { recursive: true });
        if (!fs.existsSync(目标)) fs.renameSync(解, 目标);
        console.log(`  地形包 ${包}/${版本}：${实.文件数} 个文件`);
      } else {
        let 放 = 0;
        for (const s of a.字节 ?? []) {
          const 源 = path.join(解, 'store', s.slice(0, 2), s);
          if (!fs.existsSync(源)) throw new Error(`${a.名} 里没有 ${s}`);
          if ((await 流sha(源)) !== s) throw new Error(`${a.名} 里 ${s.slice(0, 12)} 的内容 sha256 和文件名对不上`);
          if (放进store(源, 根, s)) 放++;
        }
        console.log(`  ${(a.字节 ?? []).length} 件字节，新放进 store ${放} 件`);
      }
    } finally {
      fs.rmSync(解, { recursive: true, force: true });
    }
    fs.rmSync(f, { force: true });
  }
};
