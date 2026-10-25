// 公开仓库只带 随仓库.toml 列的段要用的字节（docs/决策/0005-随仓库发字节.md），Remotion 却一次把整部作品的 段/、核对/ 都打进一个包。
// 数据根里没有的字节（私有的，或九胡、李樱这类没随仓库发的；随仓库发的打包前已补进 store，不会缺）打包不失败、也不悄悄换图：
//   段入口（画面.tsx、叠层*.tsx）闭包里碰到缺字节资产的，整个入口换成一渲就抛错的组件。只换 asset: 不够：库/角色/九胡.tsx 这类在模块顶层就取字节，
//   注册.tsx 注册时挨个求值所有段的画面，一抛整个包都读不出 Composition；
//   别处的 asset:<id> 换成一取值就抛错的占位模块（段.ts、外壳闭包里缺的，在模块顶层取就还是会拖垮包，打包前报出来）。
// 数据根字节都在（主检出）时什么都不做。接在 webpack改写 外面（渲/渲.ts 的 打包、remotion.config.ts），不改 webpack.ts：它的文本进所有段指纹的「打包规则」。
// 指纹：闭包里有缺字节资产的段记一项 缺字节（指纹/指纹.ts），补上字节就过期。
import fs from 'node:fs';
import path from 'node:path';
import type { WebpackOverrideFn } from '@remotion/bundler';
import { 数据根 } from '../环境/配置.ts';
import { 代码根 } from '../环境/路径.ts';
import { 作品名 } from '../环境/作品.ts';
import { 闭包, 检查上下文, type 依赖图 } from '../检查/上下文.ts';
import { 字节路径, 读作品资产锁, type 资产锁 } from './资产锁.ts';

/** 这些 id 里登记了、字节又不在数据根的（不管私有还是提取） */
export const 缺字节 = (ids: Iterable<string>, 锁: 资产锁, 根: string): string[] =>
  [...new Set(ids)].filter((id) => 锁[id] && !fs.existsSync(字节路径(锁[id]!, 根))).sort();

const 说缺 = (ids: string[]) => `${ids.slice(0, 3).map((id) => `「${id}」`).join('')}${ids.length > 3 ? ` 等 ${ids.length} 件` : ''}`;

/** asset: 的占位：CommonJS 带 __esModule，webpack 的默认导入在用的地方才取 default，取的时候抛错 */
export const 占位源码 = (id: string, 应在: string) => {
  const 话 = `资产「${id}」的字节不在 ${应在}（公开仓库只带 随仓库.toml 列的段要用的、不带私有的），用到它的画面渲不了`;
  return `// anim 生成：${话}\nmodule.exports = { __esModule: true, get default() { throw new Error(${JSON.stringify(话)}); } };\n`;
};

/** 段入口的占位：default 是一渲就抛错的组件，注册照常 */
export const 入口占位源码 = (入口: string, ids: string[]) => {
  const 话 = `${入口} 要的字节 ${说缺(ids)} 不在数据根（公开仓库只带 随仓库.toml 列的段要用的、不带私有的），这段渲不了`;
  return `// anim 生成：${话}\nmodule.exports = { __esModule: true, default: function 缺字节() { throw new Error(${JSON.stringify(话)}); } };\n`;
};

const 写占位 = (名: string, 源: string, 根: string) => {
  const file = path.join(根, 'cache', '缺字节', `${名}.cjs`);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== 源) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.写入中-${process.pid}`;
    fs.writeFileSync(tmp, 源);
    fs.renameSync(tmp, file);
  }
  return file;
};

/** 比路径用：Windows 上盘符大小写、分隔符可能不同 */
const 规范 = (p: string) => (process.platform === 'win32' ? path.normalize(p).toLowerCase() : path.normalize(p));

export type 缺字节入口 = {
  /** 能换的段入口（相对代码根的正斜杠路径）→ 闭包里缺的 id */
  换: Map<string, string[]>;
  /** 换不了的入口（段.ts、作品 index.ts、设置.ts）→ 闭包里缺的 id */
  换不了: Map<string, string[]>;
};

/** 按依赖图挑出闭包碰到缺字节资产的入口：注册.tsx 的 webpackContext 收的 段/、核对/ 下每段的 段.ts、画面.tsx、叠层*.tsx，加外壳 */
export const 挑缺字节入口 = (图: 依赖图, 作品目录: string, 缺: ReadonlySet<string>): 缺字节入口 => {
  const r: 缺字节入口 = { 换: new Map(), 换不了: new Map() };
  const 段文件 = /^(段|核对)\/[^/]+\/(段\.ts|画面\.tsx|叠层[^/]*\.tsx)$/;
  const 入口们 = [...图.边.keys()].filter((p) => p.startsWith(`${作品目录}/`) && 段文件.test(p.slice(作品目录.length + 1)));
  for (const f of [...入口们, `${作品目录}/index.ts`, 'engine/段/设置.ts'].sort()) {
    if (!图.边.has(f)) continue;
    const ids = [...new Set([...闭包(图, [f])].flatMap((x) => 图.资产.get(x) ?? []))].filter((id) => 缺.has(id)).sort();
    if (!ids.length) continue;
    (/\/(画面\.tsx|叠层[^/]*\.tsx)$/.test(f) ? r.换 : r.换不了).set(f, ids);
  }
  return r;
};

type 解析数据 = { request: string; context?: string };
type 编译器 = { hooks: { normalModuleFactory: { tap: (name: string, fn: (nmf: { hooks: { beforeResolve: { tap: (o: { name: string; stage: number }, fn: (d: 解析数据) => void) => void } } }) => void) => void } } };

/** 排在 webpack.ts 的 资产解析插件 前面：缺字节的段入口、asset: 改成占位模块的路径，那边见不是 asset: 就不管 */
export class 缺字节占位插件 {
  readonly 锁: 资产锁;
  readonly 根: string;
  readonly 入口: Map<string, { 名: string; ids: string[] }>;
  readonly 换了: Set<string> = new Set();
  /** 入口：绝对路径 → 相对路径和缺的 id */
  constructor(锁: 资产锁, 根: string, 入口: Map<string, { 名: string; ids: string[] }> = new Map()) {
    this.锁 = 锁;
    this.根 = 根;
    this.入口 = new Map([...入口].map(([k, v]) => [规范(k), v]));
  }
  apply(compiler: 编译器) {
    compiler.hooks.normalModuleFactory.tap('anim-缺字节', (nmf) => {
      nmf.hooks.beforeResolve.tap({ name: 'anim-缺字节', stage: -10 }, (data) => {
        if (data.request.startsWith('asset:')) {
          const id = data.request.slice('asset:'.length);
          const 条目 = this.锁[id];
          if (!条目 || fs.existsSync(字节路径(条目, this.根))) return;
          if (!this.换了.has(id)) console.error(`!! 资产「${id}」的字节不在数据根，打进包的是占位（用到它的画面渲的时候报错）`);
          this.换了.add(id);
          data.request = 写占位(条目.sha256, 占位源码(id, 字节路径(条目, this.根)), this.根);
          return;
        }
        if (!this.入口.size || !data.context || !/^\.\.?[/\\]/.test(data.request)) return;
        const e = this.入口.get(规范(path.resolve(data.context, data.request)));
        if (!e) return;
        if (!this.换了.has(e.名)) console.error(`!! ${e.名} 要的字节 ${说缺(e.ids)} 不在数据根，这段打进包的是占位（渲它会报错）`);
        this.换了.add(e.名);
        data.request = 写占位(`入口-${e.名.replace(/[/\\:]/g, '_')}`, 入口占位源码(e.名, e.ids), this.根);
      });
    });
  }
}

/** 数据根里缺了这部作品锁里的字节时，用 anim check 的依赖图挑出要换的段入口；都在就不建图 */
export const 算缺字节入口 = async (锁: 资产锁, 根: string): Promise<缺字节入口 | undefined> => {
  const 缺 = new Set(缺字节(Object.keys(锁), 锁, 根));
  if (!缺.size) return undefined;
  const c = new 检查上下文(代码根(), { 作品: 作品名() });
  try {
    return 挑缺字节入口(await c.依赖图(), c.作品目录, 缺);
  } finally {
    c.收尾();
  }
};

/** 给 webpack改写 套一层：插件放在最前面 */
export const 补缺字节占位 =
  (改写: WebpackOverrideFn, 作品根: string): WebpackOverrideFn =>
  async (config) => {
    const c = await 改写(config);
    const 锁 = 读作品资产锁(作品根);
    const 根 = 数据根();
    const 入口 = await 算缺字节入口(锁, 根);
    for (const [f, ids] of 入口?.换不了 ?? []) console.error(`!! ${f} 的闭包要的字节 ${说缺(ids)} 不在数据根，换不了整段；在模块顶层取的话整个包都读不出 Composition`);
    const 表 = new Map([...(入口?.换 ?? [])].map(([f, ids]) => [path.join(代码根(), ...f.split('/')), { 名: f, ids }]));
    return { ...c, plugins: [new 缺字节占位插件(锁, 根, 表), ...(c.plugins ?? [])] };
  };
