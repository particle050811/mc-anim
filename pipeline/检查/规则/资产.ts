// 资产：资产表字段齐全（许可是 SPDX 表达式）、资产表和资产锁一一对应、私有的进 私有/ 库；
// 代码里 asset:、cue、台词表、角色包引用的 id 都已登记；段声明的地形包登记了版本；公开构建（全部渲染代码）的闭包里没有私有资产。
// --深：逐个核对库里字节的 sha256 和大小，地形包按整包清单指纹核对。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 读内容 } from '../内容.ts';
import { 是渲染代码, type 报告, type 检查上下文 } from '../上下文.ts';
import { 读台词表 } from './台词.ts';
import { 读资产表, type 资产条目 } from '../../资产/资产表.ts';
import { 字节路径, type 资产锁 } from '../../资产/资产锁.ts';
import { 数据根 as 配置数据根 } from '../../环境/配置.ts';

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

type 地形表 = { 包?: Record<string, { 版本: string; 清单sha256?: string; 文件数?: number; 大小?: number; 许可?: string; 可见性?: string }> };

export const 资产 = async (c: 检查上下文, 报: 报告) => {
  const 表 = 读资产表(c.绝对('assets/registry'));
  for (const q of 表.问题) 报.错(q, 'assets/registry');
  const 锁 = (c.读json('assets/资产锁.json') ?? {}) as 资产锁;
  const 登记 = 表.条目;

  for (const e of 登记.values()) {
    if (typeof e.许可 === 'string' && !SPDX合法(e.许可)) 报.错(`「${e.id}」的许可「${e.许可}」不是 SPDX 表达式（第三方照原协议，自制的 LicenseRef-用户保留，拿不准 LicenseRef-待定）`, `assets/registry/${e.表}`);
    const l = 锁[e.id];
    if (!l) 报.错(`「${e.id}」登记了但不在资产锁里（入库：sr assets add 或导入工具）`, `assets/registry/${e.表}`);
    else if ((e.可见性 === '私有') !== (l.库 === '私有')) 报.错(`「${e.id}」可见性是 ${e.可见性}，资产锁里却在 ${l.库} 库（私有的只进 私有/，别的进 store/）`, 'assets/资产锁.json');
  }
  for (const [id, l] of Object.entries(锁)) {
    if (!登记.has(id)) 报.错(`资产锁里的「${id}」没在资产表登记（资产锁是工具生成的，先登记再入库）`, 'assets/资产锁.json');
    if (!/^[0-9a-f]{64}$/.test(l.sha256) || !Number.isInteger(l.大小) || !['store', '私有'].includes(l.库)) 报.错(`资产锁里「${id}」的 sha256、大小、库不完整`, 'assets/资产锁.json');
  }
  const 待定 = [...登记.values()].filter((e) => e.许可 === 'LicenseRef-待定').length;
  if (待定) 报.信息.push(`${待定} 件许可待定（见 assets/待确认.md）`);

  const 查 = (id: string, 哪: string, 文件?: string): 资产条目 | undefined => {
    const e = 登记.get(id);
    if (!e) 报.错(`${哪}引用的「${id}」没在资产表登记`, 文件);
    else if (!锁[id]) 报.错(`${哪}引用的「${id}」不在资产锁里`, 文件);
    return e;
  };

  // 代码里的 asset:
  const 图 = await c.依赖图();
  if (图.错误.length) 报.错(`依赖图不全（打包失败 ${图.错误.length} 处，见 结构），打不进包的文件里引的 asset: 和私有资产没查到，修好再跑一遍`);
  for (const [文件, ids] of 图.资产) {
    for (const id of ids) {
      const e = 查(id, 'asset:', 文件);
      if (e?.可见性 === '私有' && 是渲染代码(文件)) {
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
  for (const [名, v] of Object.entries(地形.包 ?? {})) {
    if (!v.版本 || !v.许可 || !v.可见性) 报.错(`地形包「${名}」要写 版本、许可、可见性`, 'assets/地形版本.json');
    else if (!SPDX合法(v.许可)) 报.错(`地形包「${名}」的许可「${v.许可}」不是 SPDX 表达式`, 'assets/地形版本.json');
  }

  // 台词表的配音
  for (const t of 读台词表(c) ?? []) if (typeof t.配音 === 'string') 查(t.配音, `台词「${t.id}」的配音`, 'story/台词.toml');

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
