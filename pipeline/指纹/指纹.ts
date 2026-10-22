// 段指纹：决定母版要不要重渲。代码部分按默克尔算（默克尔.ts：去注释、格式，说明符换成目标哈希，路径不进），再并上别的输入：
//   代码    画面（或叠层入口）、段.ts、设置.ts、外壳（作品 index.ts，到 清单.ts 的边不跟，加段、改顺序不让已有段过期）各自的默克尔根；
//           npm 包按 lockfile 版本、asset: 按资产锁 sha 已在叶子里
//   地形    段声明的地形包和登记的版本（assets/地形版本.json）
//   渲染设置 传给 Remotion 的全部渲染参数和 inputProps
//   依赖版本 lockfile 里 remotion、three 等决定像素的包
//   打包规则 webpack 改写、ogg 解码各自规范化文本的哈希（不跟它们的闭包），和影响输出的 tsconfig 编译选项
//   平台    process.platform-arch（跨平台不要求逐像素一致）
// 指纹 = 项按键排序后的 JSON 的 sha256；.指纹.json 另存 明细（路径 → 模块哈希、asset id → sha），不进指纹，只给 anim stale 说明是哪个文件变了。
// 透明叠层（段.ts 的 叠层）同样算，入口换成叠层文件，段记成 `<段键>-<名>`。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 代码根, 相对代码根 } from '../环境/路径.ts';
import { 作品根 } from '../环境/作品.ts';
import { 算默克尔, 文本哈希, 编译选项, 锁定版本, 默克尔算法, type 默克尔明细 } from './默克尔.ts';
import type { 段信息 } from '../清单/清单.ts';
import type { 叠层定义 } from '../../engine/段/段定义.ts';

export type 指纹项 = {
  代码: { 画面根: string; 段根: string; 设置根: string; 外壳根: string };
  地形: Record<string, string>;
  渲染设置: Record<string, unknown>;
  依赖版本: Record<string, string | null>;
  打包规则: Record<string, string>;
  平台: string;
};
export type 段指纹 = { 段: string; 指纹: string; 算法: typeof 默克尔算法; 项: 指纹项; 明细: 默克尔明细 };
export { 锁定版本 };

/** 决定像素和声音的包，不管闭包里直接引没引都记版本 */
const 关键依赖 = ['remotion', '@remotion/bundler', '@remotion/renderer', '@remotion/media', '@remotion/three', 'three', 'react', 'react-dom', 'webpack', 'esbuild'];
/** 外壳入口是所选作品的 index.ts（和 渲.ts 的 entryPoint 同一个） */
const 外壳入口 = () => 相对代码根(path.join(作品根(), 'index.ts'));
const 打包规则文件 = ['pipeline/资产/webpack.ts', 'pipeline/资产/ogg解码.cjs'];

const sha = (buf: crypto.BinaryLike) => crypto.createHash('sha256').update(buf).digest('hex');

/** 键排序的 JSON（指纹要和对象键的插入顺序无关） */
export const 稳定JSON = (x: unknown): string => {
  if (Array.isArray(x)) return `[${x.map(稳定JSON).join(',')}]`;
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${稳定JSON(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(x);
};

export const 读地形版本表 = (): Record<string, string> => {
  const file = path.join(代码根(), 'assets', '地形版本.json');
  if (!fs.existsSync(file)) return {};
  const 包 = (JSON.parse(fs.readFileSync(file, 'utf8')).包 ?? {}) as Record<string, { 版本: string }>;
  return Object.fromEntries(Object.entries(包).map(([k, v]) => [k, v.版本]));
};

export const 叠层键 = (段键: string, l: 叠层定义) => `${段键}-${l.名}`;

/** 外壳到作品 清单.ts 的边不跟（加段、改顺序不影响已有段的像素） */
const 略过清单 = (importer: string, 目标: string) => path.basename(importer) === '注册.tsx' && path.basename(目标) === '清单.ts';

export const 算段指纹 = async (s: 段信息, 渲染设置: Record<string, unknown>, 叠层?: 叠层定义): Promise<段指纹> => {
  const 入口 = 叠层 ? path.join(s.目录, 叠层.入口) : s.画面;
  const { 根, 明细 } = await 算默克尔([相对代码根(入口), 相对代码根(s.段文件), 'engine/段/设置.ts', 外壳入口()], { 略过: 略过清单 });
  const 版本表 = 读地形版本表();
  const 地形 = Object.fromEntries(
    [...s.段.地形].sort().map((名) => {
      if (!版本表[名]) throw new Error(`${s.键} 用的地形包 ${名} 没在 assets/地形版本.json 登记版本`);
      return [名, 版本表[名]!];
    }),
  );
  const 打包规则: Record<string, string> = { tsconfig: sha(稳定JSON(编译选项())) };
  for (const f of 打包规则文件) 打包规则[f] = await 文本哈希(f);
  const 项: 指纹项 = {
    代码: { 画面根: 根[0]!, 段根: 根[1]!, 设置根: 根[2]!, 外壳根: 根[3]! },
    地形,
    渲染设置: { ...渲染设置, 帧数: s.段.帧数, fps: s.段.fps, 宽: s.段.宽, 高: s.段.高 },
    依赖版本: Object.fromEntries(关键依赖.map((k) => [k, 锁定版本(k)])),
    打包规则,
    平台: `${process.platform}-${process.arch}`,
  };
  return { 段: 叠层 ? 叠层键(s.键, 叠层) : s.键, 指纹: sha(稳定JSON(项)), 算法: 默克尔算法, 项, 明细 };
};

/** 两份指纹哪些项变了；给了明细就细到文件（只挪了路径的记成「挪了」）。旧算法的记录不逐项比 */
export const 指纹差异 = (旧: Pick<段指纹, '项'> & { 明细?: 默克尔明细; 算法?: string }, 新: Pick<段指纹, '项'> & { 明细?: 默克尔明细; 算法?: string }): string[] => {
  if (旧.算法 !== 新.算法 || !('代码' in 旧.项)) return [`指纹算法换过（${旧.算法 ?? '旧算法'} → ${新.算法 ?? '旧算法'}），不逐项比`];
  const 差: string[] = [];
  const 比表 = (名: string, a: Record<string, unknown>, b: Record<string, unknown>) => {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) 差.push(`${名} 多了 ${k}`);
      else if (!(k in b)) 差.push(`${名} 少了 ${k}`);
      else if (稳定JSON(a[k]) !== 稳定JSON(b[k])) 差.push(`${名} 改了 ${k}`);
    }
  };
  比表('代码', 旧.项.代码, 新.项.代码);
  if (旧.明细 && 新.明细 && 差.length) {
    const a = 旧.明细.模块;
    const b = 新.明细.模块;
    const 旧哈希 = new Map(Object.entries(a).map(([p, h]) => [h, p]));
    const 新哈希 = new Set(Object.values(b));
    for (const [p, h] of Object.entries(b)) {
      if (p in a) {
        if (a[p] !== h) 差.push(`模块 改了 ${p}`);
      } else if (旧哈希.has(h)) 差.push(`模块 挪了 ${旧哈希.get(h)} → ${p}`);
      else 差.push(`模块 多了 ${p}`);
    }
    for (const [p, h] of Object.entries(a)) if (!(p in b) && !新哈希.has(h)) 差.push(`模块 少了 ${p}`);
    比表('资产', 旧.明细.资产, 新.明细.资产);
  }
  比表('地形', 旧.项.地形, 新.项.地形);
  比表('渲染设置', 旧.项.渲染设置, 新.项.渲染设置);
  比表('依赖版本', 旧.项.依赖版本, 新.项.依赖版本);
  比表('打包规则', 旧.项.打包规则, 新.项.打包规则);
  if (旧.项.平台 !== 新.项.平台) 差.push(`平台 ${旧.项.平台} → ${新.项.平台}`);
  return 差;
};
