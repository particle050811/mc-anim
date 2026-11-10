// 资产锁 assets/资产锁/（工具生成，人不手改）：一件资产一个文件 <id>.json（id 里的 / 就是子目录），内容 { sha256, 大小, 库, 后缀 }，键排序、UTF-8、缩进 2。
// 一件一个文件是为了并行的 Agent 各自登记资产时不撞同一个文件（以前整份一个 JSON，合并冲突 26 次，用户 11-06「按你的想法优化」）。
// 登记在作品资产表（<作品根>/资产表/）的 id 写在 <作品根>/资产锁/，格式一样；一部作品用的是两份并起来（读作品资产锁）。
// 字节按内容寻址放在数据根：可见性=私有 的进 私有/，其余进 store/，路径 <库>/<sha 前 2 位>/<sha256>，无后缀，只增不改。
// 这个文件也被 remotion.config.ts 打进 Remotion 的配置包，只能用 Node 自带模块和本仓库的纯 TS。
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 数据根 } from '../环境/配置.ts';
import { 代码根 } from '../环境/路径.ts';

export type 库 = 'store' | '私有';
/** 时长（秒）、峰值（采样峰值 dBFS）、响度（积分响度 LUFS）：音频入库时量的可选字段（资产/音频量.ts），不进指纹 */
export type 锁条目 = { sha256: string; 大小: number; 库: 库; 后缀: string; 时长?: number; 峰值?: number; 响度?: number };
export type 资产锁 = Record<string, 锁条目>;

/** 锁目录 */
export const 资产锁路径 = () => path.join(代码根(), 'assets', '资产锁');
export const 作品资产锁路径 = (作品根: string) => path.join(作品根, '资产锁');
/** 一件资产的锁文件 */
export const 锁文件路径 = (目录: string, id: string) => `${path.join(目录, ...id.split('/'))}.json`;

const 锁文本 = (条目: 锁条目) => {
  // 字段排序，和 Python json.dumps(sort_keys=True, ensure_ascii=False, indent=2) 写出的逐字节一样
  const 排 = Object.fromEntries(Object.keys(条目).sort().map((k) => [k, (条目 as Record<string, unknown>)[k]]));
  return JSON.stringify(排, null, 2) + '\n';
};

/** 整份一个文件的旧格式还在（老分支合进来又带回来）就报错，不悄悄漏掉它里面的条目 */
const 拦旧格式 = (目录: string) => {
  if (fs.existsSync(`${目录}.json`)) throw new Error(`${目录}.json 是整份一个文件的旧资产锁，现在一件资产一个文件放 ${目录}/：把它的条目并进去（写资产锁）再删掉它`);
};

export const 读资产锁 = (目录 = 资产锁路径()): 资产锁 => {
  拦旧格式(目录);
  if (!fs.existsSync(目录)) return {};
  const 条: [string, 锁条目][] = [];
  for (const rel of fs.readdirSync(目录, { recursive: true }) as string[]) {
    if (!rel.endsWith('.json')) continue;
    const f = path.join(目录, rel);
    try {
      条.push([rel.slice(0, -'.json'.length).split(path.sep).join('/'), JSON.parse(fs.readFileSync(f, 'utf8')) as 锁条目]);
    } catch (e) {
      throw new Error(`${f} 读不了：${(e as Error).message}`);
    }
  }
  // 键按 id 排（和以前整份 JSON 的键序一样），不按文件路径排
  return Object.fromEntries(条.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
};

/** 打包一部作品用的锁：共用的 assets/资产锁/ 并上 <作品根>/资产锁/（没有就只用共用的）；同一个 id 两边都有就报错。
 *  这部作品选用了材质包就再盖上材质包覆盖层（套材质包）：在 照材质包选用 里按那一组的选用，不在就按作品的 "包"（当前材质包选用）；
 *  作品写了 换用.toml 的先照它把共用 id 换成作品自己那件的字节（套换用），材质包覆盖层盖在换过的上面；换用 = false 是没换的（取材配方的输入要原件）。
 *  写锁的地方（assets add、extract --登记）读的是 读资产锁(单份)，不经这里 */
export const 读作品资产锁 = (作品根: string, 选 = 当前材质包选用(作品根), 换用 = true): 资产锁 => {
  const 共用 = 读资产锁();
  const 作品 = 读资产锁(作品资产锁路径(作品根));
  const 重 = Object.keys(作品).filter((id) => id in 共用);
  if (重.length) throw new Error(`资产 id 在共用锁和 ${作品资产锁路径(作品根)} 里都有：${重.join('、')}（一个 id 只登记在一侧）`);
  const 并 = { ...共用, ...作品 };
  return 套材质包(换用 ? 套换用(并, 作品根) : 并, 作品根, 选);
};

// 按作品换用：<作品根>/换用.toml 一行一条 "<共用 id>" = "<本作品资产 id>"，这部作品里引用左边 id 的地方（asset:、打包、指纹）拿到的是右边那件的字节，
// 别的作品不受影响。现在只给体素方块表用：全局表、图集公开发且别的作品的画面钉在它上面，作品要的模组方块做成「全局表 + 追加」的附加表登记在作品侧
// （sourcing/extract.toml「方块附加-…」，docs/世界.md「给方块表加模组方块」）。
export const 换用表路径 = (作品根: string) => path.join(作品根, '换用.toml');

/** 换用.toml 的条目；没有这个文件是空的。随 remotion.config.ts 打包不能用 TOML 库，只认 "…" = "…" 和 # 注释 */
export const 读换用表 = (作品根: string): [string, string][] => {
  const f = 换用表路径(作品根);
  if (!fs.existsSync(f)) return [];
  const 出: [string, string][] = [];
  for (const 行 of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = 行.replace(/\s+#.*$/, '').trim();
    if (!t || t.startsWith('#')) continue;
    const m = /^"([^"]+)"\s*=\s*"([^"]+)"$/.exec(t);
    if (!m) throw new Error(`${f}：一行一条，写成 "<共用资产 id>" = "<本作品资产 id>"，这里认不出：${t}`);
    if (出.some(([a]) => a === m[1])) throw new Error(`${f}：${m[1]} 写了两次`);
    出.push([m[1], m[2]]);
  }
  return 出;
};

export const 套换用 = (锁: 资产锁, 作品根: string): 资产锁 => {
  const 表 = 读换用表(作品根);
  if (!表.length) return 锁;
  const 出 = { ...锁 };
  for (const [原, 换] of 表) {
    if (!锁[原]) throw new Error(`${换用表路径(作品根)}：${原} 不在资产锁里（只能换已登记的资产）`);
    if (!锁[换]) throw new Error(`${换用表路径(作品根)}：${换} 不在资产锁里：先登记、入库（anim assets add，或对应的 anim extract … --登记）`);
    if (锁[原].后缀 !== 锁[换].后缀) throw new Error(`${换用表路径(作品根)}：${原}（${锁[原].后缀}）和 ${换}（${锁[换].后缀}）后缀不一样`);
    出[原] = 锁[换];
  }
  return 出;
};

// 材质包兼容层（用户 11-02「找一个更好的材质包」「写个统一的兼容层…也兼容现有的光影和材质包」）：标准 Java 版资源包 zip 按资产 id 登记（类 材质包/），
// 作品在 <作品根>/材质包.toml 写 "包" = [...] 选用（顺序同 MC 资源包界面，上面的盖下面的），anim assets 材质包 生成覆盖层锁：
// 被包换掉的 id → 换后的字节，盖在作品锁上，打包、指纹都看盖过的（换了的贴图 sha 不同，段指纹跟着变）。没写或空 = 原版，锁、指纹都不变。
// 试样不改作品：环境变量 ANIM_PACKS=<名,名…> 顶掉作品的选用（=原版 关掉），覆盖层锁放数据根 cache/材质包/<作品>/。变量名用 ASCII：本机 zsh 会把中文变量名搅乱。
// 封顶：一格最多几个贴图像素（16 = 缩回原版尺寸；不写按作品画风放到最大，见 材质包.ts 放大上限），环境变量 ANIM_PACKS_RES 或 材质包.toml 的 "封顶" = 16（全作品一个）。
// 分辨率：材质包.toml 的 "分辨率" = 64（全作品一个）同试验倍数一样不按画风整除，照这个分辨率上屏（用户 11-07 定《把回忆拼好给你》直接用 64x）。
// 试验倍数（用户 11-06 要看 64x、128x、256x 真上屏的样子和渲染时长）：环境变量 ANIM_PACKS_TRY=64|128|256 只跟 ANIM_PACKS 一起才起作用，
// 不按画风整除、照这个分辨率放（一个贴图像素不再是整数个成片像素），覆盖层锁名带 @试验<N>；作品的 材质包.toml 不认它。
// 按段选（用户 11-02「材质包应该也是可选项 而不是耦合的」）：材质包.toml 的 [段] 小节 "<段键>" = [...] 给这一段换包，[] = 这一段用原版，没写的段用 "包"。
// 选的包只进那一段自己的指纹（换了的贴图 sha 在它闭包的 asset: 叶子里），别的段不动；打包、算指纹按选用分组，一组一个打包（按材质包分组、照材质包选用）。
// Studio（remotion.config.ts）只有一个打包，按作品的 "包"：[段] 里另选的段在 Studio 里看到的是作品的包，以 anim still、film 为准。
export const 材质包变量 = 'ANIM_PACKS';
export const 材质包封顶变量 = 'ANIM_PACKS_RES';
export const 材质包试验变量 = 'ANIM_PACKS_TRY';
export const 作品材质包表路径 = (作品根: string) => path.join(作品根, '材质包.toml');
/** 来自：作品 = 作品的 "包"；段 = [段] 小节给这一段另选的（和 "包" 一样的算 作品）；环境 = 试样的环境变量 */
export type 材质包选用 = { 包: string[]; 来自: '无' | '作品' | '段' | '环境'; 封顶?: number; 试验?: number; 分辨率?: number };
export type 材质包锁 = { 包: { id: string; sha256: string }[]; 封顶?: number; 试验?: number; 分辨率?: number; 覆盖: 资产锁; 报告?: unknown };

const 补前缀 = (x: string) => (x.startsWith('材质包/') ? x : `材质包/${x}`);

const 读封顶 = (x: string, 出处: string) => {
  const n = Number(x.trim());
  if (!Number.isInteger(n) || n < 16 || (n & (n - 1)) !== 0) throw new Error(`${出处}：封顶要写 16、32、64 这样 16 起的 2 的幂，现在是「${x}」`);
  return n;
};

const 读包数组 = (x: string, 出处: string) => {
  try {
    return (JSON.parse(`[${x.replace(/,\s*$/, '')}]`) as unknown[]).map((v) => 补前缀(String(v)));
  } catch {
    throw new Error(`${出处}：包名只能是双引号字符串`);
  }
};

export type 材质包表 = { 文件: string; 包: string[]; 封顶?: number; 分辨率?: number; 段: Map<string, string[]> };

/** <作品根>/材质包.toml；没有这个文件是 null。这个文件随 remotion.config.ts 打包，不能用 TOML 库，只认下面这几种写法：
 *  "包" = [ … ]、"封顶" = 32、"分辨率" = 64、[段] 小节里一行一段 "<段键>" = [ … ]（# 开头的行是注释） */
export const 读材质包表 = (作品根: string): 材质包表 | null => {
  const f = 作品材质包表路径(作品根);
  if (!fs.existsSync(f)) return null;
  const 行 = fs.readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('#'));
  const 小节 = 行.findIndex((l) => /^\s*\[/.test(l) && !/^\s*"?包"?\s*=/.test(l));
  const 顶 = (小节 < 0 ? 行 : 行.slice(0, 小节)).join('\n');
  const m = /^\s*"?包"?\s*=\s*\[([^\]]*)\]/m.exec(顶);
  if (!m) throw new Error(`${f}：要写成 "包" = ["材质包/<名>", …]（空数组 = 原版）`);
  const c = /^\s*"?封顶"?\s*=\s*(\S+)/m.exec(顶);
  const 分 = /^\s*"?分辨率"?\s*=\s*(\S+)/m.exec(顶);
  const 段 = new Map<string, string[]>();
  if (小节 >= 0) {
    if (行[小节]!.trim() !== '[段]') throw new Error(`${f}：只认 [段] 小节，现在是「${行[小节]!.trim()}」`);
    let 余 = 行.slice(小节 + 1).join('\n');
    for (const e of 余.matchAll(/^\s*"([^"]+)"\s*=\s*\[([^\]]*)\]/gm)) {
      if (段.has(e[1]!)) throw new Error(`${f}：[段] 里「${e[1]}」写了两次`);
      段.set(e[1]!, 读包数组(e[2]!, `${f} [段] 的「${e[1]}」`));
      余 = 余.replace(e[0], '');
    }
    if (余.trim()) throw new Error(`${f}：[段] 里一行一段，写成 "<段键>" = ["材质包/<名>", …]（[] = 这段用原版），这里认不出：${余.trim().split('\n')[0]}`);
  }
  return { 文件: f, 包: 读包数组(m[1]!, `${f} 的「包」`), ...(c ? { 封顶: 读封顶(c[1]!, f) } : {}), ...(分 ? { 分辨率: 读封顶(分[1]!, f) } : {}), 段 };
};

const 同包 = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** 选用哪些材质包：环境变量（试样，所有段一样）> 材质包.toml [段] 里这一段的 > "包"。不给段键就是作品的 */
export const 读材质包选用 = (作品根: string, 环境 = process.env[材质包变量], 环境封顶 = process.env[材质包封顶变量], 段键?: string, 环境试验 = process.env[材质包试验变量]): 材质包选用 => {
  const 带封顶 = (选: 材质包选用, 封顶: number | undefined): 材质包选用 => (选.包.length && 封顶 !== undefined ? { ...选, 封顶 } : 选);
  const 变量封顶 = 环境封顶 !== undefined && 环境封顶.trim() !== '' ? 读封顶(环境封顶, 材质包封顶变量) : undefined;
  if (环境 !== undefined && 环境.trim() !== '') {
    const 包 = 环境.trim() === '原版' ? [] : 环境.split(',').map((x) => x.trim()).filter(Boolean).map(补前缀);
    const 选 = 带封顶({ 包, 来自: 包.length ? '环境' : '无' }, 变量封顶);
    if (!包.length || 环境试验 === undefined || 环境试验.trim() === '') return 选;
    return { ...选, 试验: 读封顶(环境试验, 材质包试验变量) };
  }
  const 表 = 读材质包表(作品根);
  if (!表) return { 包: [], 来自: '无' };
  const 封顶 = 变量封顶 ?? 表.封顶;
  const 段包 = 段键 === undefined ? undefined : 表.段.get(段键);
  const 带分辨率 = (选: 材质包选用): 材质包选用 => (选.包.length && 表.分辨率 !== undefined ? { ...选, 分辨率: 表.分辨率 } : 选);
  if (段包 && !同包(段包, 表.包)) return 带分辨率(带封顶({ 包: 段包, 来自: 段包.length ? '段' : '无' }, 封顶));
  return 带分辨率(带封顶({ 包: 表.包, 来自: 表.包.length ? '作品' : '无' }, 封顶));
};

/** 材质包.toml 里用得上的每一种选用（作品的 "包" 和 [段] 另选的，去重、不含原版），anim assets 材质包 逐个建覆盖层锁 */
export const 作品的材质包选用们 = (作品根: string): 材质包选用[] => {
  const 表 = 读材质包表(作品根);
  if (!表) return [];
  const 们 = new Map<string, 材质包选用>();
  for (const 段键 of [undefined, ...表.段.keys()]) {
    const 选 = 读材质包选用(作品根, '', '', 段键);
    if (选.包.length) 们.set(材质包选用键(选), 选);
  }
  return [...们.values()];
};

/** 两份选用打出来的包一样，键就一样（分组用） */
const 试验后缀 = (选: 材质包选用) => (选.试验 !== undefined ? `@试验${选.试验}` : '');
export const 材质包选用键 = (选: 材质包选用) => (选.包.length ? `${选.来自}:${选.包.join(',')}${选.封顶 !== undefined ? `@${选.封顶}` : ''}${试验后缀(选)}` : '原版');
const 说选用 = (选: 材质包选用) => (选.包.length ? `${选.包.join('、')}${选.封顶 !== undefined ? `（封顶 ${选.封顶}）` : ''}${选.试验 !== undefined ? `（试验 ${选.试验}）` : ''}` : '原版');

// 打包、算指纹时这一组的选用：webpack改写、补缺字节占位、建默克尔图 都在里面调 读作品资产锁，不用一路传参（webpack.ts 的文本进全片指纹，改不得）
const 打包时选用 = new AsyncLocalStorage<材质包选用>();
/** fn 里（连同它发起的打包、算指纹）读作品资产锁 默认按 选 */
export const 照材质包选用 = <T>(选: 材质包选用, fn: () => T): T => 打包时选用.run(选, fn);
/** 只渲一段（still、bench）：按这一段的选用 */
export const 照段材质包 = <T>(作品根: string, 段键: string, fn: () => T): T => 照材质包选用(读材质包选用(作品根, undefined, undefined, 段键), fn);
/** 在 照材质包选用 里就是那一组的，不在就是作品的 */
export const 当前材质包选用 = (作品根: string): 材质包选用 => 打包时选用.getStore() ?? 读材质包选用(作品根);

/** 按段的选用分组，组的顺序、组里的顺序都照原来的先后；没写材质包.toml 或都一样时只有一组 */
export const 按材质包分组 = <T>(作品根: string, 项们: readonly T[], 段键: (x: T) => string): { 选: 材质包选用; 项们: T[] }[] => {
  const 组 = new Map<string, { 选: 材质包选用; 项们: T[] }>();
  for (const x of 项们) {
    const 选 = 读材质包选用(作品根, undefined, undefined, 段键(x));
    const k = 材质包选用键(选);
    const g = 组.get(k) ?? { 选, 项们: [] };
    g.项们.push(x);
    组.set(k, g);
  }
  return [...组.values()];
};

/** 一组一组在各自的选用里跑 fn（一组一个打包），结果按组的顺序 */
export const 逐组照材质包 = async <T, R>(作品根: string, 项们: readonly T[], 段键: (x: T) => string, fn: (组: T[]) => Promise<R>): Promise<R[]> => {
  const 出: R[] = [];
  for (const g of 按材质包分组(作品根, 项们, 段键)) 出.push(await 照材质包选用(g.选, () => fn(g.项们)));
  return 出;
};

/** 渲一段前核对：这个打包的选用和这一段的一样（调用处忘了按材质包分组时在这里拦下，不出错的画面） */
export const 核对段材质包 = (作品根: string, 段键: string) => {
  const 段 = 读材质包选用(作品根, undefined, undefined, 段键);
  const 包 = 当前材质包选用(作品根);
  if (材质包选用键(段) !== 材质包选用键(包)) throw new Error(`${段键} 选用的材质包是 ${说选用(段)}，这次打包按的是 ${说选用(包)}：调用处要按材质包分组打包（资产锁.ts 逐组照材质包）`);
};

/** 覆盖层锁放哪：作品选用的进 Git（<作品根>/材质包.锁.json，像资产锁一样钉住字节；[段] 另选的是 材质包-<包+包>[@封顶].锁.json）；环境变量试样的放数据根 cache/ */
export const 材质包锁路径 = (作品根: string, 选: 材质包选用, 根 = 数据根()) => {
  const 名 = `${选.包.map((x) => x.slice('材质包/'.length)).join('+')}${选.封顶 !== undefined ? `@${选.封顶}` : ''}${试验后缀(选)}`;
  if (选.来自 === '作品') return path.join(作品根, '材质包.锁.json');
  if (选.来自 === '段') return path.join(作品根, `材质包-${名}.锁.json`);
  return path.join(根, 'cache', '材质包', path.basename(作品根), `${名}.锁.json`);
};

export const 套材质包 = (锁: 资产锁, 作品根: string, 选: 材质包选用): 资产锁 => {
  if (!选.包.length) return 锁;
  const 文件 = 材质包锁路径(作品根, 选);
  const 重建 = `anim${选.来自 === '环境' ? ` 前面带 ${材质包变量}=${选.包.join(',')}${选.封顶 !== undefined ? ` ${材质包封顶变量}=${选.封顶}` : ''}${选.试验 !== undefined ? ` ${材质包试验变量}=${选.试验}` : ''}` : ''} assets 材质包`;
  if (!fs.existsSync(文件)) throw new Error(`选用了材质包 ${选.包.join('、')}，但覆盖层锁 ${文件} 不存在：先跑 ${重建}`);
  const 盖 = JSON.parse(fs.readFileSync(文件, 'utf8')) as 材质包锁;
  const 现 = 选.包.map((id) => `${id}@${锁[id]?.sha256 ?? '没登记'}`).join(',');
  const 建时 = 盖.包.map((x) => `${x.id}@${x.sha256}`).join(',');
  if (现 !== 建时) throw new Error(`覆盖层锁 ${文件} 是按 ${建时} 建的，现在选用 ${现}：重跑 ${重建}`);
  if (盖.分辨率 !== 选.分辨率) throw new Error(`覆盖层锁 ${文件} 是按分辨率 ${盖.分辨率 ?? '按画风'} 建的，现在选用 ${选.分辨率 ?? '按画风'}：重跑 ${重建}`);
  if (盖.试验 !== 选.试验) throw new Error(`覆盖层锁 ${文件} 是按试验 ${盖.试验 ?? '无'} 建的，现在选用试验 ${选.试验 ?? '无'}：重跑 ${重建}`);
  if (盖.封顶 !== 选.封顶) throw new Error(`覆盖层锁 ${文件} 是按封顶 ${盖.封顶 ?? '不限'} 建的，现在选用封顶 ${选.封顶 ?? '不限'}：重跑 ${重建}`);
  const 多 = Object.keys(盖.覆盖).filter((id) => !(id in 锁));
  if (多.length) throw new Error(`${文件} 盖了作品锁里没有的 id：${多.slice(0, 5).join('、')}（覆盖层只能换已登记的资产）`);
  return { ...锁, ...盖.覆盖 };
};

/** 让目录里的锁文件和 锁 一样：内容变了的才重写，锁里没有的删掉（空目录一并删），没变的文件不碰 */
export const 写资产锁 = (锁: 资产锁, 目录 = 资产锁路径()) => {
  拦旧格式(目录);
  const 现 = 读资产锁(目录);
  for (const [id, 条目] of Object.entries(锁)) {
    const f = 锁文件路径(目录, id);
    const 文本 = 锁文本(条目);
    if (现[id] && fs.readFileSync(f, 'utf8') === 文本) continue;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 文本, 'utf8');
  }
  for (const id of Object.keys(现)) {
    if (id in 锁) continue;
    fs.rmSync(锁文件路径(目录, id));
    for (let d = path.dirname(锁文件路径(目录, id)); d !== 目录 && !fs.readdirSync(d).length; d = path.dirname(d)) fs.rmdirSync(d);
  }
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
