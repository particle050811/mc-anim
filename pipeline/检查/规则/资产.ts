// 资产：资产表字段齐全（许可是 SPDX 表达式）、资产表和资产锁一一对应、私有的进 私有/ 库；
// 共用表锁（assets/）并上本作品的表锁（<作品>/资产表/、<作品>/资产锁.json）：同一个 id 只登记在一侧，锁写在登记它的那一侧；
// 代码里 asset:、cue、台词表、角色包引用的 id 都已登记；段声明的地形包登记了版本、取了地形包的段都声明了；公开构建（渲染代码，私有作品自己的目录除外）的闭包里没有私有资产。
// 写了 随仓库.toml 的作品：字节/ 和按当前代码算的集合一一对上、逐件核 sha，私有的不在里面（资产/随仓库.ts）。
// 写了 随发布.toml 的作品：发布锁.json 和按当前代码算的该发的（字节、地形包）对上（资产/发布.ts）。
// --深：逐个核对库里字节的 sha256 和大小，地形包按整包清单指纹核对。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 读内容 } from '../内容.ts';
import { 是渲染代码, 闭包, type 报告, type 检查上下文 } from '../上下文.ts';
import { 解析, 遍历, ts } from '../语法.ts';
import { 台词表路径, 读台词表 } from './台词.ts';
import { 合并资产表, 读资产表, type 侧, type 资产条目 } from '../../资产/资产表.ts';
import { 字节路径, type 资产锁 } from '../../资产/资产锁.ts';
import { 数据根 as 配置数据根 } from '../../环境/配置.ts';
import { 比对字节, 算随仓库, 读随仓库表, 随仓库表名, 字节目录名 } from '../../资产/随仓库.ts';
import { 比对发布锁, 算应发, 读随发布表, 随发布表名 } from '../../资产/发布.ts';
import { 发布锁名 } from '../../资产/发布锁.ts';

/**
 * 搬来的代码还没改走 cue 的私有资产：import 那一行往上连着的 import 块顶上写一行「// 待迁移（私有资产）：原因」，算待迁移、不算违规。
 * 照旧项目 7d077904「规矩例外」注释的做法，标记就在代码里，不另开白名单；返回原因，没标就是 undefined
 */
export const 私有待迁移 = (源: string, id: string): string | undefined => {
  const 行们 = 源.split('\n');
  const i = 行们.findIndex((l) => /^import\s/.test(l) && (l.includes(`'asset:${id}'`) || l.includes(`"asset:${id}"`)));
  for (let j = i - 1; i >= 0 && j >= 0; j--) {
    const m = /^\/\/ 待迁移（私有资产）：(.+)$/.exec(行们[j]!.trim());
    if (m) return m[1];
    if (!/^import\s/.test(行们[j]!)) return undefined;
  }
  return undefined;
};

/** SPDX 许可表达式：id [WITH 例外] 用 AND/OR 和括号连。LicenseRef- 后面允许中文（用户自制的 LicenseRef-用户保留） */
export const SPDX合法 = (表达式: string): boolean => {
  const 词 = 表达式.match(/\(|\)|[^\s()]+/g) ?? [];
  let i = 0;
  const 是id = (t: string | undefined) => !!t && !['AND', 'OR', 'WITH', '(', ')'].includes(t) && (/^LicenseRef-[^\s()]+$/.test(t) || /^[A-Za-z0-9.+-]+$/.test(t));
  const 项 = (): boolean => {
    if (词[i] === '(') {
      i++;
      if (!式()) return false;
      return 词[i++] === ')';
    }
    if (!是id(词[i])) return false;
    i++;
    if (词[i] === 'WITH') {
      i++;
      if (!是id(词[i])) return false;
      i++;
    }
    return true;
  };
  const 式 = (): boolean => {
    if (!项()) return false;
    while (词[i] === 'AND' || 词[i] === 'OR') {
      i++;
      if (!项()) return false;
    }
    return true;
  };
  return 词.length > 0 && 式() && i === 词.length;
};

/** 角色包里的 匹配：* 任意串（含 /），? 一个字符 */
export const 通配 = (模式: string) => new RegExp(`^${模式.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);

const 文件sha = (file: string) =>
  new Promise<string>((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });

/** 地形包整包清单指纹（同 assets/tools/导入旧项目.py 的 包清单：路径按段逐级比较排序，「相对路径\tsha256\n」逐行拼起来再取 sha256） */
export const 包清单 = async (目录: string) => {
  const 文件: string[][] = [];
  const 走 = (rel: string[]) => {
    for (const e of fs.readdirSync(path.join(目录, ...rel), { withFileTypes: true })) {
      if (e.isDirectory()) 走([...rel, e.name]);
      else if (e.isFile()) 文件.push([...rel, e.name]);
    }
  };
  走([]);
  const 比 = (a: string, b: string) => {
    const x = [...a];
    const y = [...b];
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    return x.length - y.length;
  };
  文件.sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return 比(a[i]!, b[i]!);
    return a.length - b.length;
  });
  const h = crypto.createHash('sha256');
  let 大小 = 0;
  for (const f of 文件) {
    const abs = path.join(目录, ...f);
    h.update(`${f.join('/')}\t${await 文件sha(abs)}\n`, 'utf8');
    大小 += fs.statSync(abs).size;
  }
  return { 清单sha256: h.digest('hex'), 文件数: 文件.length, 大小 };
};

/** 取区段包的模块（packDir 拼包的版本目录）：闭包里有它的段才会在渲染时取地形包 */
const 取包模块 = 'engine/voxel/区段包位置.ts';

/** 文件里的字符串字面量（不含 import 来源） */
const 字符串们 = (c: 检查上下文, p: string, 缓存: Map<string, Set<string>>) => {
  let r = 缓存.get(p);
  if (!r) {
    r = new Set();
    const sf = 解析(p, c.读(p));
    遍历(sf, (n) => {
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent)) r!.add(n.text);
    });
    缓存.set(p, r);
  }
  return r;
};

/** 随仓库发的字节：没写 随仓库.toml 的作品不该有 字节/；写了的，字节/ 要和现算的集合一致 */
const 查随仓库 = async (c: 检查上下文, 报: 报告, 锁: 资产锁) => {
  const 表 = c.作品路径(随仓库表名);
  const 字节 = c.作品路径(字节目录名);
  if (!c.存在(表)) {
    if (c.存在(字节)) 报.错(`有 ${字节}/ 却没有 ${随仓库表名}：随仓库发哪些段的字节要写在 ${表}（"段" = ["<段键或章>", …]）`, 字节);
    return;
  }
  let 选择器: string[];
  try {
    选择器 = 读随仓库表(c.读(表)).段;
  } catch (e) {
    报.错((e as Error).message.split('\n')[0]!, 表);
    return;
  }
  const 集合 = await 算随仓库(c, 选择器);
  for (const q of 集合.问题) 报.错(`随仓库：${q}`, 表);
  if (集合.问题.length) return;
  const r = 比对字节(集合, c.绝对(c.作品目录));
  const 私有sha = new Map(Object.entries(锁).filter(([, l]) => l.库 === '私有').map(([id, l]) => [l.sha256, id]));
  const 修 = '（anim assets vendor 照当前代码重写）';
  if (r.添.length) 报.错(`${字节}/ 缺 ${r.添.length} 件：${r.添.slice(0, 5).map((rel) => 集合.件.get(rel.split('/')[1]!)!.ids.join('、')).join('；')}${r.添.length > 5 ? ' 等' : ''}${修}`, 字节);
  for (const rel of r.改) 报.错(`${字节}/${rel} 的内容 sha256 和文件名对不上${修}`, `${字节}/${rel}`);
  for (const rel of r.删) {
    const 私 = 私有sha.get(rel.split('/').at(-1)!);
    if (私) 报.错(`${字节}/${rel} 是私有资产「${私}」的字节，不能随仓库发${修}`, `${字节}/${rel}`);
    else 报.错(`${字节}/${rel} 多余：${随仓库表名} 的段现在用不到，或不是 <sha 前两位>/<sha256>${修}`, `${字节}/${rel}`);
  }
  if (!r.添.length && !r.改.length && !r.删.length) {
    报.信息.push(`随仓库：${集合.段们.length} 段要的 ${r.件数} 件字节（${(r.大小 / 1e6).toFixed(1)} MB）都在 ${字节}/、sha 对；私有不带 ${集合.私有.length} 件`);
  }
};

/** 挂 Release 发的：写了 随发布.toml 的，发布锁.json 要和现算的一致；没写的不该有发布锁 */
const 查随发布 = async (c: 检查上下文, 报: 报告) => {
  const 表 = c.作品路径(随发布表名);
  const 锁文件 = c.作品路径(发布锁名);
  if (!c.存在(表)) {
    if (c.存在(锁文件)) 报.错(`有 ${锁文件} 却没有 ${随发布表名}`, 锁文件);
    return;
  }
  let 发布表;
  try {
    发布表 = 读随发布表(c.读(表));
  } catch (e) {
    报.错((e as Error).message, 表);
    return;
  }
  const 应 = await 算应发(c, 发布表);
  for (const q of 应.问题) 报.错(`随发布：${q}`, 表);
  if (应.问题.length) return;
  const 锁 = c.存在(锁文件) ? (JSON.parse(c.读(锁文件)) as Parameters<typeof 比对发布锁>[0]) : undefined;
  const 差 = 比对发布锁(锁, 应, 发布表);
  for (const q of 差) 报.错(`随发布：${q}（anim assets pack --上传 照当前代码重打、传上去）`, 锁文件);
  if (!差.length) 报.信息.push(`随发布：${应.段数} 段要的 ${应.字节.length} 件字节、${应.地形.length} 个地形包和 ${锁文件} 对得上${应.私有.length ? `；私有不发 ${应.私有.length} 件` : ''}`);
};

type 地形表 = { 包?: Record<string, { 版本: string; 清单sha256?: string; 文件数?: number; 大小?: number; 许可?: string; 可见性?: string }> };

export const 资产 = async (c: 检查上下文, 报: 报告) => {
  const 表目录: Record<侧, string> = { 共用: 'assets/registry', 作品: c.作品路径('资产表') };
  const 锁文件: Record<侧, string> = { 共用: 'assets/资产锁.json', 作品: c.作品路径('资产锁.json') };
  const 共用表 = 读资产表(c.绝对(表目录.共用));
  const 作品表 = 读资产表(c.绝对(表目录.作品), '作品');
  for (const q of 共用表.问题) 报.错(q, 表目录.共用);
  for (const q of 作品表.问题) 报.错(q, 表目录.作品);
  const 表位置 = (e: 资产条目) => `${表目录[e.侧]}/${e.表}`;
  const { 条目: 登记, 重复 } = 合并资产表(共用表, 作品表);
  for (const e of 重复) 报.错(`「${e.id}」在 ${表位置(共用表.条目.get(e.id)!)} 和 ${表位置(e)} 里都登记了（一个 id 只登记在一侧）`, 表位置(e));
  const 两锁 = c.资产锁();
  const 锁: 资产锁 = { ...两锁.作品, ...两锁.共用 };
  const 两边都有 = new Set(Object.keys(两锁.作品).filter((id) => id in 两锁.共用));
  for (const id of 两边都有) 报.错(`「${id}」在 ${锁文件.共用} 和 ${锁文件.作品} 里都有（一个 id 只写在登记它那一侧的锁里）`, 锁文件.作品);

  for (const e of 登记.values()) {
    if (typeof e.许可 === 'string' && !SPDX合法(e.许可)) 报.错(`「${e.id}」的许可「${e.许可}」不是 SPDX 表达式（第三方照原协议，自制的 LicenseRef-用户保留，拿不准 LicenseRef-待定）`, 表位置(e));
    const l = 两锁[e.侧][e.id];
    if (!l) {
      // 写错了一侧的，下面按锁报一次就够
      if (!锁[e.id]) 报.错(`「${e.id}」登记了但不在资产锁里（入库：anim assets add 或导入工具）`, 表位置(e));
    } else if ((e.可见性 === '私有') !== (l.库 === '私有')) 报.错(`「${e.id}」可见性是 ${e.可见性}，资产锁里却在 ${l.库} 库（私有的只进 私有/，别的进 store/）`, 锁文件[e.侧]);
  }
  for (const s of ['共用', '作品'] as const) {
    for (const [id, l] of Object.entries(两锁[s])) {
      const e = 登记.get(id);
      if (!e) 报.错(`资产锁里的「${id}」没在资产表登记（资产锁是工具生成的，先登记再入库）`, 锁文件[s]);
      else if (e.侧 !== s && !两边都有.has(id)) 报.错(`「${id}」登记在 ${表位置(e)}，资产锁却写在 ${锁文件[s]}（anim assets add 写进登记它那一侧，重跑一次就挪过去）`, 锁文件[s]);
      if (!/^[0-9a-f]{64}$/.test(l.sha256) || !Number.isInteger(l.大小) || !['store', '私有'].includes(l.库)) 报.错(`资产锁里「${id}」的 sha256、大小、库不完整`, 锁文件[s]);
    }
  }
  const 待定 = [...登记.values()].filter((e) => e.许可 === 'LicenseRef-待定').length;
  if (待定) 报.信息.push(`${待定} 件许可待定（见 assets/待确认.md）`);

  const 查 = (id: string, 哪: string, 文件?: string): 资产条目 | undefined => {
    const e = 登记.get(id);
    if (!e) 报.错(`${哪}引用的「${id}」没在资产表登记`, 文件);
    else if (!锁[id]) 报.错(`${哪}引用的「${id}」不在资产锁里`, 文件);
    return e;
  };

  // 代码里的 asset:。私有作品不进公开构建，它自己目录里的不查「公开构建无私有资产」（0004 用户 10-22 定）；engine/、库/ 照查
  const 图 = await c.依赖图();
  if (图.错误.length) 报.错(`依赖图不全（打包失败 ${图.错误.length} 处，见 结构），打不进包的文件里引的 asset: 和私有资产没查到，修好再跑一遍`);
  const 私有作品 = c.作品私有;
  if (私有作品) 报.跳过.push(`${c.作品目录} 被 .gitignore 挡住、是私有作品，它目录里 import 私有资产不查（不进公开构建）`);
  for (const [文件, ids] of 图.资产) {
    for (const id of ids) {
      const e = 查(id, 'asset:', 文件);
      if (e?.可见性 === '私有' && 是渲染代码(文件) && !(私有作品 && 文件.startsWith(`${c.作品目录}/`))) {
        const 缓 = 私有待迁移(c.读(文件), id);
        if (缓) 报.待(`${文件} 还把私有资产 asset:${id} 打进包里（${缓}）`, 文件);
        else 报.错(`公开构建的闭包里不能有私有资产：${文件} import 了 asset:${id}（私有的走 cue，缺了按规矩降级或报错，不打进包）`, 文件);
      }
    }
  }

  // 段声明的地形、cue 里的资产
  const 地形 = (c.读json('assets/地形版本.json') ?? {}) as 地形表;
  const 内容 = await 读内容(c);
  if (!('错误' in 内容)) {
    for (const s of 内容.段们) {
      for (const 名 of s.定义?.地形 ?? []) if (!地形.包?.[名]) 报.错(`${s.键} 用的地形包「${名}」没在 assets/地形版本.json 登记`, s.段文件);
      for (const cue of s.定义?.声音 ?? []) if (cue.资产 !== undefined) 查(cue.资产, `${s.键} 第 ${cue.帧} 帧的 cue `, s.段文件);
    }
  }
  // 取了地形包的段（闭包里有 packDir）：闭包里写到的登记过的包名都要在 段.地形 里。指纹的地形项只按 段.地形 记版本，漏写了换版本这段不会过期
  if (!('错误' in 内容) && !图.错误.length) {
    const 包名们 = new Set(Object.keys(地形.包 ?? {}));
    const 缓存 = new Map<string, Set<string>>();
    for (const s of 内容.段们) {
      if (!s.定义) continue;
      const 入口 = [`${s.目录}/画面.tsx`, s.段文件, ...(s.定义.叠层 ?? []).map((l) => `${s.目录}/${l.入口}`)].filter((p) => 图.边.has(p));
      const 文件们 = 闭包(图, 入口);
      if (!文件们.has(取包模块)) continue;
      const 用到 = new Set<string>();
      for (const f of 文件们) if (/\.[cm]?[jt]sx?$/.test(f) && c.存在(f)) for (const t of 字符串们(c, f, 缓存)) if (包名们.has(t)) 用到.add(t);
      const 漏 = [...用到].filter((名) => !s.定义!.地形.includes(名)).sort();
      if (漏.length) 报.错(`${s.键} 的闭包会取地形包（${取包模块}），写到了 ${漏.join('、')}，段.ts 的 地形 里没有：地形包的版本只经 段.地形 进指纹`, s.段文件);
    }
  }
  for (const [名, v] of Object.entries(地形.包 ?? {})) {
    if (!v.版本 || !v.许可 || !v.可见性) 报.错(`地形包「${名}」要写 版本、许可、可见性`, 'assets/地形版本.json');
    else if (!SPDX合法(v.许可)) 报.错(`地形包「${名}」的许可「${v.许可}」不是 SPDX 表达式`, 'assets/地形版本.json');
  }

  // 台词表的配音
  for (const t of 读台词表(c) ?? []) if (typeof t.配音 === 'string') 查(t.配音, `台词「${t.id}」的配音`, 台词表路径(c));

  // 角色包
  const ids = [...登记.keys()];
  for (const p of c.文件().filter((x) => /^assets\/kits\/[^/]+\.toml$/.test(x))) {
    let doc: Record<string, unknown>;
    try {
      doc = c.读toml(p)!;
    } catch (e) {
      报.错(`TOML 解析失败：${(e as Error).message.split('\n')[0]}`, p);
      continue;
    }
    const 名 = path.posix.basename(p, '.toml');
    if (doc['角色'] !== 名) 报.错(`角色 字段要和文件名一致（${名}）`, p);
    for (const b of (doc['基准'] ?? []) as { 资产?: string; 用途?: string }[]) if (typeof b.资产 === 'string') 查(b.资产, `角色包 ${名} 的基准「${b.用途}」`, p);
    for (const g of (doc['资产组'] ?? []) as { 资产?: string[]; 匹配?: string[]; 文字源?: string[]; 用途?: string }[]) {
      for (const id of g.资产 ?? []) 查(id, `角色包 ${名}「${g.用途}」`, p);
      for (const m of g.匹配 ?? []) if (!ids.some((id) => 通配(m).test(id))) 报.错(`角色包 ${名}「${g.用途}」的匹配 ${m} 一件也没对上`, p);
      for (const f of g.文字源 ?? []) if (!c.存在(f)) 报.错(`角色包 ${名}「${g.用途}」的文字源 ${f} 不在仓库里`, p);
    }
    for (const k of (doc['代码'] ?? []) as { 新位置?: string }[]) if (k.新位置 && !c.存在(k.新位置)) 报.待(`角色包 ${名} 的代码 ${k.新位置} 还没搬`, p);
  }

  await 查随仓库(c, 报, 锁);
  await 查随发布(c, 报);

  if (!c.深) return;
  const 根 = c.数据根 ?? 配置数据根();
  const 已核 = new Map<string, string | null>();
  for (const [id, l] of Object.entries(锁)) {
    const f = 字节路径(l, 根);
    if (!已核.has(f)) 已核.set(f, fs.existsSync(f) ? await 文件sha(f) : null);
    const 实 = 已核.get(f);
    if (实 === null) 报.错(`「${id}」的字节不在 ${f}`);
    else if (实 !== l.sha256) 报.错(`「${id}」库里的字节 sha256 是 ${实!.slice(0, 12)}，资产锁记的是 ${l.sha256.slice(0, 12)}`);
    else if (fs.statSync(f).size !== l.大小) 报.错(`「${id}」库里的字节大小和资产锁不一致`);
  }
  for (const [名, v] of Object.entries(地形.包 ?? {})) {
    const dir = path.join(根, 'terrain', 名, v.版本);
    if (!fs.existsSync(dir)) {
      报.错(`地形包 ${名}/${v.版本} 不在 ${dir}`);
      continue;
    }
    const 实 = await 包清单(dir);
    if (实.清单sha256 !== v.清单sha256 || 实.文件数 !== v.文件数 || 实.大小 !== v.大小) {
      报.错(`地形包 ${名}/${v.版本} 和 assets/地形版本.json 记的不一致（清单指纹 ${实.清单sha256.slice(0, 12)}、${实.文件数} 个文件、${实.大小} 字节）`);
    }
  }
  报.信息.push(`深查：${已核.size} 个库对象、${Object.keys(地形.包 ?? {}).length} 个地形包逐字节核过`);
};
