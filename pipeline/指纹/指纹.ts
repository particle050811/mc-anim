// 段指纹：决定母版要不要重渲。把旧项目 remotion.config.ts 给航线求解算的「依赖闭包源码哈希」推广到每段，并把别的输入一起算进去：
//   闭包    画面.tsx、段.ts、设置.ts 的 esbuild 依赖闭包里每个文件的 sha256（esbuild 列出来，和打包实际用到的一样，不手列），外加注册外壳；
//           闭包引用的 npm 包按 lockfile 里的版本记
//   资产    闭包里每个 asset: id 的 sha256（资产锁）
//   地形    段声明的地形包和登记的版本（assets/地形版本.json）
//   渲染设置 传给 Remotion 的全部渲染参数和 inputProps
//   依赖版本 lockfile 里 remotion、three 等决定像素的包
//   打包规则 remotion.config.ts 和它用的 webpack 改写、ogg 解码
//   平台    process.platform-arch（跨平台不要求逐像素一致）
// 指纹 = 这些项按键排序后的 JSON 的 sha256；.指纹.json 存逐项展开，anim stale 拿它说明是哪项变了。
// 透明叠层（段.ts 的 叠层）同样算，入口换成叠层文件，段记成 `<段键>-<名>`。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { 代码根, 相对代码根 } from '../环境/路径.ts';
import { esbuild资产插件, 非代码loader, type 资产记录 } from '../资产/esbuild插件.ts';
import { 读资产锁 } from '../资产/资产锁.ts';
import type { 段信息 } from '../清单/清单.ts';
import type { 叠层定义 } from '../../content/段定义.ts';

export type 指纹项 = {
  闭包: { 文件: Record<string, string>; 外部包: Record<string, string | null> };
  资产: Record<string, string>;
  地形: Record<string, string>;
  渲染设置: Record<string, unknown>;
  依赖版本: Record<string, string | null>;
  打包规则: Record<string, string>;
  平台: string;
};
export type 段指纹 = { 段: string; 指纹: string; 项: 指纹项 };

/** 决定像素和声音的包，不管闭包里直接引没引都记版本 */
const 关键依赖 = ['remotion', '@remotion/bundler', '@remotion/renderer', '@remotion/media', '@remotion/three', 'three', 'react', 'react-dom', 'webpack', 'esbuild'];
const 外壳文件 = ['content/index.ts', 'content/注册.tsx'];
const 打包规则文件 = ['remotion.config.ts', 'pipeline/资产/webpack.ts', 'pipeline/资产/ogg解码.cjs'];

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

let lock缓存: Record<string, { version?: string }> | undefined;
export const 锁定版本 = (包: string): string | null => {
  lock缓存 ??= JSON.parse(fs.readFileSync(path.join(代码根(), 'package-lock.json'), 'utf8')).packages as Record<string, { version?: string }>;
  return lock缓存[`node_modules/${包}`]?.version ?? null;
};

const 包名 = (spec: string) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);

const 文件表 = (相对路径们: Iterable<string>) => {
  const r: Record<string, string> = {};
  for (const p of [...相对路径们].sort()) r[p] = sha(fs.readFileSync(path.join(代码根(), p)));
  return r;
};

/** 入口们的依赖闭包：文件 sha、外部包版本、asset id 的 sha */
export const 算闭包 = async (入口: string[]) => {
  const 资产: 资产记录 = new Map();
  const r = await build({
    entryPoints: 入口,
    absWorkingDir: 代码根(),
    bundle: true,
    write: false,
    metafile: true,
    outdir: 'out',
    platform: 'browser',
    format: 'esm',
    jsx: 'automatic',
    packages: 'external',
    loader: 非代码loader,
    plugins: [esbuild资产插件(读资产锁(), 资产)],
    logLevel: 'silent',
  });
  const 文件: string[] = [];
  const 外部 = new Set<string>();
  for (const [p, info] of Object.entries(r.metafile.inputs)) {
    if (!p.includes(':')) 文件.push(p.split(path.sep).join('/'));
    for (const imp of info.imports) if (imp.external) 外部.add(包名(imp.path));
  }
  return {
    文件: 文件表(文件),
    外部包: Object.fromEntries([...外部].sort().map((k) => [k, 锁定版本(k)])),
    资产: Object.fromEntries([...资产].sort(([a], [b]) => (a < b ? -1 : 1))),
  };
};

export const 读地形版本表 = (): Record<string, string> => {
  const file = path.join(代码根(), 'assets', '地形版本.json');
  if (!fs.existsSync(file)) return {};
  const 包 = (JSON.parse(fs.readFileSync(file, 'utf8')).包 ?? {}) as Record<string, { 版本: string }>;
  return Object.fromEntries(Object.entries(包).map(([k, v]) => [k, v.版本]));
};

export const 叠层键 = (段键: string, l: 叠层定义) => `${段键}-${l.名}`;

export const 算段指纹 = async (s: 段信息, 渲染设置: Record<string, unknown>, 叠层?: 叠层定义): Promise<段指纹> => {
  const 入口 = 叠层 ? path.join(s.目录, 叠层.入口) : s.画面;
  const 闭包 = await 算闭包([相对代码根(入口), 相对代码根(s.段文件), 'content/设置.ts']);
  const 版本表 = 读地形版本表();
  const 地形 = Object.fromEntries(
    [...s.段.地形].sort().map((名) => {
      if (!版本表[名]) throw new Error(`${s.键} 用的地形包 ${名} 没在 assets/地形版本.json 登记版本`);
      return [名, 版本表[名]!];
    }),
  );
  const 项: 指纹项 = {
    闭包: { 文件: { ...闭包.文件, ...文件表(外壳文件) }, 外部包: 闭包.外部包 },
    资产: 闭包.资产,
    地形,
    渲染设置: { ...渲染设置, 帧数: s.段.帧数, fps: s.段.fps, 宽: s.段.宽, 高: s.段.高 },
    依赖版本: Object.fromEntries(关键依赖.map((k) => [k, 锁定版本(k)])),
    打包规则: 文件表(打包规则文件),
    平台: `${process.platform}-${process.arch}`,
  };
  return { 段: 叠层 ? 叠层键(s.键, 叠层) : s.键, 指纹: sha(稳定JSON(项)), 项 };
};

/** 两份指纹哪些项变了（逐项，闭包和资产细到文件、id） */
export const 指纹差异 = (旧: 指纹项, 新: 指纹项): string[] => {
  const 差: string[] = [];
  const 比表 = (名: string, a: Record<string, unknown>, b: Record<string, unknown>) => {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) 差.push(`${名} 多了 ${k}`);
      else if (!(k in b)) 差.push(`${名} 少了 ${k}`);
      else if (稳定JSON(a[k]) !== 稳定JSON(b[k])) 差.push(`${名} 改了 ${k}`);
    }
  };
  比表('闭包文件', 旧.闭包.文件, 新.闭包.文件);
  比表('外部包', 旧.闭包.外部包, 新.闭包.外部包);
  比表('资产', 旧.资产, 新.资产);
  比表('地形', 旧.地形, 新.地形);
  比表('渲染设置', 旧.渲染设置, 新.渲染设置);
  比表('依赖版本', 旧.依赖版本, 新.依赖版本);
  比表('打包规则', 旧.打包规则, 新.打包规则);
  if (旧.平台 !== 新.平台) 差.push(`平台 ${旧.平台} → ${新.平台}`);
  return 差;
};
