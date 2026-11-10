// anim extract --粒子帧：照粒子定义（jar 里 assets/<命名空间>/particles/<名>.json）的 textures 顺序生成帧模块 <作品根>/粒子帧/<命名空间>/<名>.ts
// （定义登记在共用锁的放 库/粒子帧/），画面一行 `import 帧 from '…/粒子帧/goety/frost.ts'` 拿到排好序的 Png[]。
// 为什么生成进 Git 的模块、不做 asset:粒子/… 虚拟模块：打包（webpack.ts，文本进全部段指纹）、指纹、检查、随仓库、缺字节都按「asset: = 锁里一件」认，
// 虚拟模块要每处特判；生成的模块里只有普通的 asset:<贴图 id>，这些地方都不用动。anim check 核对生成的和定义、锁对得上（规则 资产）。
// jar 里的文件对应哪件资产，照 sourcing/extract.toml 的配方反查（导出模型 只导贴图的步骤、拷jar文件.py 的步骤，加上「产物」表），不按 id 的写法猜：
// 同一张贴图在几条配方里都导过（库里的 贴图/特效/杂项粒子/sga_a、作品里的 贴图/法术/…）时字节一样取哪件都一样，按定义同组优先、再按 id 排；字节不一样报错。
import fs from 'node:fs';
import path from 'node:path';
import { 字节路径, type 资产锁 } from '../资产/资产锁.ts';
import { 展开产物, type 取材清单 } from './清单.ts';

export type 两侧锁 = { 共用: 资产锁; 作品: 资产锁 };
export type 粒子 = { 命名空间: string; 名: string };
export type 粒子帧 = { 粒子: string; 定义: string; 侧: '共用' | '作品'; 文件: string; 文本: string; 帧: string[] };
export type 粒子帧错 = { 粒子: string; 错: string; 缺贴图?: string[] };
/** jar 里的路径 → 从它导出的资产 id（只收锁里有的） */
export type 来源表 = Map<string, string[]>;

/** goety:frost → {goety, frost}；不写命名空间是 minecraft（同 ResourceLocation） */
export const 解析粒子名 = (s: string): 粒子 => {
  const i = s.indexOf(':');
  const [a, b] = i >= 0 ? [s.slice(0, i), s.slice(i + 1)] : ['minecraft', s];
  if (!/^[a-z0-9_.-]+$/.test(a) || !/^[a-z0-9_./-]+$/.test(b)) throw new Error(`粒子名「${s}」不对：写 <命名空间>:<名>，如 goety:frost`);
  return { 命名空间: a, 名: b };
};

export const 定义路径 = (p: 粒子) => `assets/${p.命名空间}/particles/${p.名}.json`;
export const 贴图路径 = (p: 粒子) => `assets/${p.命名空间}/textures/particle/${p.名}.png`;

const 通配式 = (s: string) => new RegExp(`^${s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);

/**
 * 从配方反查 jar 路径 → 资产 id。认两种步骤：
 *   导出模型 只要贴图的写法（来源全是 .png，可写 名字=路径，路径里 * 只在文件名里）：输出是目录时每张存成 目录/名字.png，是 .png 时只有一张；
 *   python 拷jar文件.py <jar> <jar 里的路径> <输出文件>。
 * 输出文件再按条目的「产物」表（通配按锁展开）对到 id。
 */
export const 建来源表 = (q: 取材清单, 锁: 资产锁): 来源表 => {
  const 表: 来源表 = new Map();
  const 记 = (jar内: string, id: string) => {
    const xs = 表.get(jar内) ?? [];
    if (!xs.includes(id)) 表.set(jar内, [...xs, id].sort());
  };
  for (const e of q.条目.values()) {
    const 文件到id = new Map<string, string>();
    for (const [id, f] of 展开产物(e.产物, 锁).对) if (锁[id]) 文件到id.set(path.posix.normalize(f), id);
    if (!文件到id.size) continue;
    for (const 步 of e.步骤) {
      const s = 步.map((x) => (typeof x === 'string' ? x : ''));
      if (s[0] === 'python' && s[1]?.endsWith('/拷jar文件.py') && s.length === 5) {
        const id = 文件到id.get(path.posix.normalize(s[4]!));
        if (id) 记(s[3]!, id);
        continue;
      }
      if (s[0] !== '导出模型' || s.length < 4) continue;
      const 输出 = s[2]!;
      const 来源 = s.slice(3);
      if (!来源.every((x) => x.endsWith('.png') && !x.startsWith('--'))) continue;
      for (const x of 来源) {
        const k = x.indexOf('=');
        const [名, jar内] = k >= 0 ? [x.slice(0, k), x.slice(k + 1)] : [undefined, x];
        if (输出.endsWith('.png')) {
          const id = 文件到id.get(path.posix.normalize(输出));
          if (id && 来源.length === 1 && !jar内.includes('*')) 记(jar内, id);
          continue;
        }
        const 基 = path.posix.basename(jar内, '.png');
        if (!jar内.includes('*')) {
          const id = 文件到id.get(path.posix.normalize(`${输出}/${名 ?? 基}.png`));
          if (id) 记(jar内, id);
          continue;
        }
        if (path.posix.dirname(jar内).includes('*') || 名) continue;
        const 式 = 通配式(path.posix.basename(jar内));
        const 前 = `${path.posix.normalize(输出)}/`;
        for (const [f, id] of 文件到id) {
          if (!f.startsWith(前) || !f.endsWith('.png') || f.slice(前.length).includes('/')) continue;
          const 文件名 = f.slice(前.length);
          if (式.test(文件名)) 记(`${path.posix.dirname(jar内)}/${文件名}`, id);
        }
      }
    }
  }
  return 表;
};

const 同组优先 = (ids: string[], 定义id: string) => {
  const 组 = 定义id.split('/')[1];
  return [...ids].sort((a, b) => Number(b.split('/')[1] === 组) - Number(a.split('/')[1] === 组) || (a < b ? -1 : a > b ? 1 : 0));
};

/** 来源表里登记了定义的全部粒子（命名空间:名，排好序） */
export const 列粒子 = (表: 来源表): string[] =>
  [...表.keys()].flatMap((k) => {
    const m = /^assets\/([^/]+)\/particles\/(.+)\.json$/.exec(k);
    return m ? [`${m[1]}:${m[2]}`] : [];
  }).sort();

/** 生成的文件放哪：定义在作品锁 → <作品根>/粒子帧/，在共用锁 → 库/粒子帧/ */
export const 粒子帧文件 = (p: 粒子, 侧: '共用' | '作品', 代码根: string, 作品根: string) =>
  path.join(侧 === '作品' ? 作品根 : path.join(代码根, '库'), '粒子帧', p.命名空间, ...`${p.名}.ts`.split('/'));

export const 生成头 = '// anim extract --粒子帧 生成，别手改';

export const 粒子帧文本 = (粒子名: string, 定义id: string, 定义sha: string, 帧: string[]): string => {
  const 唯一 = [...new Set(帧)];
  const 名 = new Map(唯一.map((id, i) => [id, `图${i}`]));
  return [
    `${生成头}：粒子 ${粒子名} 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。`,
    `// 定义 ${定义id} sha256 ${定义sha}`,
    `import { png, type Png } from '@engine/model/贴图.ts';`,
    ...唯一.map((id) => `import ${名.get(id)} from 'asset:${id}';`),
    '',
    `const 帧: readonly Png[] = [${帧.map((id) => 名.get(id)).join(', ')}].map(png);`,
    'export default 帧;',
    '',
  ].join('\n');
};

/** 生成文件头记的定义 id 和 sha；不是生成的文件返回 undefined */
export const 读生成头 = (文本: string): { 定义: string; sha: string } | undefined => {
  if (!文本.startsWith(生成头)) return undefined;
  const m = /^\/\/ 定义 (\S+) sha256 ([0-9a-f]{64})$/m.exec(文本);
  return m ? { 定义: m[1]!, sha: m[2]! } : undefined;
};

/** 定义 json 的 textures */
export const 读textures = (字节: string, 定义id: string): string[] => {
  const j = JSON.parse(字节) as { textures?: unknown };
  if (!Array.isArray(j.textures) || !j.textures.length || !j.textures.every((t) => typeof t === 'string')) throw new Error(`${定义id} 没有 textures（Provider 里程序画的粒子，没有贴图帧）`);
  return j.textures as string[];
};

/** 算一种粒子的帧模块；定义没登记、字节不在、贴图没登记都给 粒子帧错 */
export const 算粒子帧 = (
  粒子名: string,
  锁: 两侧锁,
  表: 来源表,
  代码根: string,
  作品根: string,
  读 = (e: 资产锁[string]) => fs.readFileSync(字节路径(e), 'utf8'),
): 粒子帧 | 粒子帧错 => {
  try {
    const p = 解析粒子名(粒子名);
    const 名 = `${p.命名空间}:${p.名}`;
    const 定义们 = 表.get(定义路径(p)) ?? [];
    if (!定义们.length) return { 粒子: 名, 错: `定义没登记：在 sourcing/extract.toml 的粒子定义配方里加一步（拷jar文件.py 拷 ${定义路径(p)}），再 anim extract <配方> --登记` };
    if (定义们.length > 1) return { 粒子: 名, 错: `定义登记了 ${定义们.length} 件：${定义们.join('、')}（只留一件）` };
    const 定义 = 定义们[0]!;
    const 侧 = 锁.作品[定义] ? '作品' : '共用';
    const 条 = (侧 === '作品' ? 锁.作品 : 锁.共用)[定义]!;
    let 字节: string;
    try {
      字节 = 读(条);
    } catch {
      return { 粒子: 名, 错: `${定义} 的字节不在数据根（先 anim assets pull，或 anim extract <粒子定义配方>）` };
    }
    const textures = 读textures(字节, 定义);
    // 共用侧生成进 库/，只许引共用锁里的贴图（别的作品打包时没有这部作品的锁）
    const 可用 = 侧 === '共用' ? 锁.共用 : { ...锁.共用, ...锁.作品 };
    const 缺: string[] = [];
    const 帧 = textures.map((t) => {
      const ids = (表.get(贴图路径(解析粒子名(t))) ?? []).filter((id) => 可用[id]?.后缀 === '.png');
      if (!ids.length) {
        if (!缺.includes(t)) 缺.push(t);
        return '';
      }
      if (new Set(ids.map((id) => 可用[id]!.sha256)).size > 1) throw new Error(`贴图 ${t} 对上了字节不同的几件：${ids.join('、')}（定不了用哪件）`);
      return 同组优先(ids, 定义)[0]!;
    });
    if (缺.length) return { 粒子: 名, 错: `${缺.length} 张贴图没登记（哪条配方都没导）：${缺.map((t) => 贴图路径(解析粒子名(t))).join('、')}`, 缺贴图: 缺 };
    const 文件 = 粒子帧文件(p, 侧, 代码根, 作品根);
    return { 粒子: 名, 定义, 侧, 文件, 文本: 粒子帧文本(名, 定义, 条.sha256, 帧), 帧 };
  } catch (e) {
    return { 粒子: 粒子名, 错: (e as Error).message };
  }
};

export const 是错 = (x: 粒子帧 | 粒子帧错): x is 粒子帧错 => '错' in x;

/** 已生成的帧模块（作品和库两处），返回绝对路径 */
export const 已生成文件 = (代码根: string, 作品根: string): string[] =>
  [path.join(作品根, '粒子帧'), path.join(代码根, '库', '粒子帧')]
    .flatMap((d) => (fs.existsSync(d) ? (fs.readdirSync(d, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts')).map((f) => path.join(d, f)) : []))
    .sort();

/** 文件路径 → 粒子名（<…>/粒子帧/<命名空间>/<名>.ts） */
export const 文件的粒子 = (f: string): string => {
  const 段 = f.split(/[\\/]/);
  const i = 段.lastIndexOf('粒子帧');
  return `${段[i + 1]}:${段.slice(i + 2).join('/').replace(/\.ts$/, '')}`;
};

/**
 * anim check 用：已生成的每个文件，头里的定义 sha 要和锁里一样；定义字节在本机的，再按现在的配方、锁重算，文本要一字不差。
 * 返回 [文件, 说明]
 */
export const 核对粒子帧 = (代码根: string, 作品根: string, 锁: 两侧锁, 表: 来源表, 读?: (e: 资产锁[string]) => string): [string, string][] => {
  const 问题: [string, string][] = [];
  for (const f of 已生成文件(代码根, 作品根)) {
    const 文本 = fs.readFileSync(f, 'utf8');
    const 头 = 读生成头(文本);
    if (!头) {
      问题.push([f, '粒子帧/ 下只放 anim extract --粒子帧 生成的模块（头认不出）']);
      continue;
    }
    const 条 = 锁.共用[头.定义] ?? 锁.作品[头.定义];
    if (!条) {
      问题.push([f, `记的定义 ${头.定义} 不在资产锁里`]);
      continue;
    }
    if (条.sha256 !== 头.sha) {
      问题.push([f, `定义 ${头.定义} 换了字节（锁 ${条.sha256.slice(0, 12)}，生成时 ${头.sha.slice(0, 12)}）：anim extract --粒子帧 重生成`]);
      continue;
    }
    const r = 算粒子帧(文件的粒子(f), 锁, 表, 代码根, 作品根, 读);
    if (是错(r)) {
      if (!r.错.includes('字节不在数据根')) 问题.push([f, r.错]);
      continue;
    }
    if (path.resolve(r.文件) !== path.resolve(f)) 问题.push([f, `应该在 ${r.文件}`]);
    else if (r.文本 !== 文本) 问题.push([f, '和按现在的定义、配方、资产锁生成的不一样（手改了，或贴图对应的 id 变了）：anim extract --粒子帧 重生成']);
  }
  return 问题;
};
