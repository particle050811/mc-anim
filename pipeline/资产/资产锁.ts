// 资产锁 assets/资产锁.json（工具生成，人不手改）：id → { sha256, 大小, 库, 后缀 }，键排序、UTF-8、缩进 2。
// 登记在作品资产表（<作品根>/资产表/）的 id 写在 <作品根>/资产锁.json，格式一样；一部作品用的是两份并起来（读作品资产锁）。
// 字节按内容寻址放在数据根：可见性=私有 的进 私有/，其余进 store/，路径 <库>/<sha 前 2 位>/<sha256>，无后缀，只增不改。
// 这个文件也被 remotion.config.ts 打进 Remotion 的配置包，只能用 Node 自带模块和本仓库的纯 TS。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 数据根 } from '../环境/配置.ts';
import { 代码根 } from '../环境/路径.ts';

export type 库 = 'store' | '私有';
/** 时长（秒）、峰值（采样峰值 dBFS）、响度（积分响度 LUFS）：音频入库时量的可选字段（资产/音频量.ts），不进指纹 */
export type 锁条目 = { sha256: string; 大小: number; 库: 库; 后缀: string; 时长?: number; 峰值?: number; 响度?: number };
export type 资产锁 = Record<string, 锁条目>;

export const 资产锁路径 = () => path.join(代码根(), 'assets', '资产锁.json');
export const 作品资产锁路径 = (作品根: string) => path.join(作品根, '资产锁.json');

export const 读资产锁 = (file = 资产锁路径()): 资产锁 => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as 资产锁;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`${file} 读不了：${(e as Error).message}`);
  }
};

/** 打包一部作品用的锁：共用的 assets/资产锁.json 并上 <作品根>/资产锁.json（没有就只用共用的）；同一个 id 两边都有就报错。
 *  这部作品选用了材质包（读材质包选用）就再盖上材质包覆盖层（套材质包）；写锁的地方（assets add、extract --登记）读的是 读资产锁(单份)，不经这里 */
export const 读作品资产锁 = (作品根: string, 选 = 读材质包选用(作品根)): 资产锁 => {
  const 共用 = 读资产锁();
  const 作品 = 读资产锁(作品资产锁路径(作品根));
  const 重 = Object.keys(作品).filter((id) => id in 共用);
  if (重.length) throw new Error(`资产 id 在共用锁和 ${作品资产锁路径(作品根)} 里都有：${重.join('、')}（一个 id 只登记在一侧）`);
  return 套材质包({ ...共用, ...作品 }, 作品根, 选);
};

// 材质包兼容层（用户 11-02「找一个更好的材质包」「写个统一的兼容层…也兼容现有的光影和材质包」）：标准 Java 版资源包 zip 按资产 id 登记（类 材质包/），
// 作品在 <作品根>/材质包.toml 写 "包" = [...] 选用（顺序同 MC 资源包界面，上面的盖下面的），anim assets 材质包 生成覆盖层锁：
// 被包换掉的 id → 换后的字节，盖在作品锁上，打包、指纹都看盖过的（换了的贴图 sha 不同，段指纹跟着变）。没写或空 = 原版，锁、指纹都不变。
// 试样不改作品：环境变量 ANIM_PACKS=<名,名…> 顶掉作品的选用（=原版 关掉），覆盖层锁放数据根 cache/材质包/<作品>/。变量名用 ASCII：本机 zsh 会把中文变量名搅乱。
export const 材质包变量 = 'ANIM_PACKS';
export const 作品材质包表路径 = (作品根: string) => path.join(作品根, '材质包.toml');
export type 材质包选用 = { 包: string[]; 来自: '无' | '作品' | '环境' };
export type 材质包锁 = { 包: { id: string; sha256: string }[]; 覆盖: 资产锁; 报告?: unknown };

const 补前缀 = (x: string) => (x.startsWith('材质包/') ? x : `材质包/${x}`);

/** 这部作品选用哪些材质包：环境变量 > <作品根>/材质包.toml 的 "包"。这个文件随 remotion.config.ts 打包，不能用 TOML 库，只认一行 "包" = [ … ] 的写法 */
export const 读材质包选用 = (作品根: string, 环境 = process.env[材质包变量]): 材质包选用 => {
  if (环境 !== undefined && 环境.trim() !== '') {
    const 包 = 环境.trim() === '原版' ? [] : 环境.split(',').map((x) => x.trim()).filter(Boolean).map(补前缀);
    return { 包, 来自: 包.length ? '环境' : '无' };
  }
  const f = 作品材质包表路径(作品根);
  if (!fs.existsSync(f)) return { 包: [], 来自: '无' };
  const 正文 = fs.readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  const m = /^\s*"?包"?\s*=\s*\[([^\]]*)\]/m.exec(正文);
  if (!m) throw new Error(`${f}：要写成 "包" = ["材质包/<名>", …]（空数组 = 原版）`);
  let 包: string[];
  try {
    包 = (JSON.parse(`[${m[1]!.replace(/,\s*$/, '')}]`) as unknown[]).map((x) => 补前缀(String(x)));
  } catch {
    throw new Error(`${f}：「包」里只能是双引号字符串`);
  }
  return { 包, 来自: 包.length ? '作品' : '无' };
};

/** 覆盖层锁放哪：作品选用的进 Git（<作品根>/材质包.锁.json，像资产锁一样钉住字节）；环境变量试样的放数据根 cache/ */
export const 材质包锁路径 = (作品根: string, 选: 材质包选用, 根 = 数据根()) =>
  选.来自 === '作品'
    ? path.join(作品根, '材质包.锁.json')
    : path.join(根, 'cache', '材质包', path.basename(作品根), `${选.包.map((x) => x.slice('材质包/'.length)).join('+')}.锁.json`);

export const 套材质包 = (锁: 资产锁, 作品根: string, 选: 材质包选用): 资产锁 => {
  if (!选.包.length) return 锁;
  const 文件 = 材质包锁路径(作品根, 选);
  const 重建 = `anim${选.来自 === '环境' ? ` 前面带 ${材质包变量}=${选.包.join(',')}` : ''} assets 材质包`;
  if (!fs.existsSync(文件)) throw new Error(`选用了材质包 ${选.包.join('、')}，但覆盖层锁 ${文件} 不存在：先跑 ${重建}`);
  const 盖 = JSON.parse(fs.readFileSync(文件, 'utf8')) as 材质包锁;
  const 现 = 选.包.map((id) => `${id}@${锁[id]?.sha256 ?? '没登记'}`).join(',');
  const 建时 = 盖.包.map((x) => `${x.id}@${x.sha256}`).join(',');
  if (现 !== 建时) throw new Error(`覆盖层锁 ${文件} 是按 ${建时} 建的，现在选用 ${现}：重跑 ${重建}`);
  const 多 = Object.keys(盖.覆盖).filter((id) => !(id in 锁));
  if (多.length) throw new Error(`${文件} 盖了作品锁里没有的 id：${多.slice(0, 5).join('、')}（覆盖层只能换已登记的资产）`);
  return { ...锁, ...盖.覆盖 };
};

export const 写资产锁 = (锁: 资产锁, file = 资产锁路径()) => {
  // 条目里的字段也排序，和 Python json.dumps(sort_keys=True, ensure_ascii=False, indent=2) 写出的逐字节一样
  const 排 = (o: object): object => Object.fromEntries(Object.keys(o).sort().map((k) => [k, (o as Record<string, unknown>)[k]]));
  const 排好 = Object.fromEntries(Object.keys(锁).sort().map((k) => [k, 排(锁[k]!)]));
  fs.writeFileSync(file, JSON.stringify(排好, null, 2) + '\n', 'utf8');
};

export const 字节路径 = (条目: Pick<锁条目, 'sha256' | '库'>, 根 = 数据根()) => path.join(根, 条目.库, 条目.sha256.slice(0, 2), 条目.sha256);

export const 文件sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** 资产 id 规则：<类>/<名>，Windows 文件名合法、不含空格 */
export const id合法 = (id: string) => /^[^/\s]+(\/[^/\s]+)+$/.test(id) && !/[<>:"\\|?*\x00-\x1f]/.test(id);

export class 缺资产 extends Error {}

/** 按 id 查锁、确认字节在库里；查不到给出该跑的命令 */
export const 解析资产 = (id: string, 锁: 资产锁, 根 = 数据根()) => {
  const 条目 = 锁[id];
  if (!条目) {
    throw new 缺资产(
      `资产锁里没有「${id}」：先在 assets/registry/<类>.toml（只有一部作品用的在 <作品根>/资产表/）登记，再跑 anim assets add ${id} <文件> 入库、写资产锁`,
    );
  }
  const file = 字节路径(条目, 根);
  if (!fs.existsSync(file)) throw new 缺资产(`资产「${id}」的字节不在 ${file}：数据根不全（检查 ANIM_DATA，或从别的机器同步 store/、私有/）`);
  return { 条目, 文件: file };
};

/** 文件放进库（APFS 上是克隆，不占空间），返回锁条目；同 sha 已在就不动 */
export const 入库 = (源: string, 库名: 库, 根 = 数据根()): 锁条目 => {
  const sha256 = 文件sha256(源);
  const 条目: 锁条目 = { sha256, 大小: fs.statSync(源).size, 库: 库名, 后缀: path.extname(源).toLowerCase() };
  const 目标 = 字节路径(条目, 根);
  if (!fs.existsSync(目标)) {
    fs.mkdirSync(path.dirname(目标), { recursive: true });
    const tmp = `${目标}.写入中-${process.pid}`;
    fs.copyFileSync(源, tmp, fs.constants.COPYFILE_FICLONE);
    fs.chmodSync(tmp, 0o444);
    fs.renameSync(tmp, 目标);
  }
  return 条目;
};
