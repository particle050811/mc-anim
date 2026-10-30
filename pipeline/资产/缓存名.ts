// webpack 缓存目录名不随资产锁、求解指纹变。
// Remotion 拿整份 webpack 配置 JSON 的 md5 当缓存目录名（@remotion/bundler 的 shared-bundler-config.js computeHashAndFinalConfig），
// 而 webpack.ts 把整份资产锁挂在 资产解析插件 上、求解指纹放进 DefinePlugin，缺字节.ts 的插件也挂着锁：assets add 一次就换一个目录、冷打包一次。
// 这里给这些插件实例挂 toJSON，进那份 JSON 的只剩「是哪个插件」和不随内容变的字段；webpack 用的锁、定义的值都不动。
// 缓存为什么不会读到过期的：asset:<id> 每次编译都在 beforeResolve 里按当时的锁改写成 store/<sha> 路径（模块工厂不进持久缓存），锁变了就是另一个模块；
// DefinePlugin 的值 webpack 5 记在用到它的模块的 valueDependencies 里，值变了这些模块重编（缓存名.test.ts 用真 webpack 验过这两条）。
// 不改 webpack.ts：它的文本进所有段指纹的「打包规则」，改一个字全片过期。
import type { WebpackOverrideFn } from '@remotion/bundler';
import webpack from 'webpack';
import { 资产解析插件 } from './webpack.ts';
import { 缺字节占位插件 } from './缺字节.ts';

/** DefinePlugin 里按内容变、webpack 自己会跟踪的定义：缓存名里只记名字 */
const 运行时定义 = ['__SOLVER_FINGERPRINTS__'];

const 挂JSON = (o: object, json: () => unknown) => Object.defineProperty(o, 'toJSON', { value: json, enumerable: false, configurable: true });

/** 给一个插件实例挂上算缓存名用的 JSON；不认识的插件不动 */
export const 缓存名里去掉内容 = (插件: unknown) => {
  if (插件 instanceof 资产解析插件) 挂JSON(插件, () => ({ 插件: 'anim-资产解析' }));
  else if (插件 instanceof 缺字节占位插件) 挂JSON(插件, () => ({ 插件: 'anim-缺字节占位', 根: 插件.根 }));
  else if (插件 instanceof webpack.DefinePlugin) {
    const 定义 = 插件.definitions as Record<string, unknown>;
    if (!运行时定义.some((k) => k in 定义)) return;
    挂JSON(插件, () => ({ definitions: Object.fromEntries(Object.entries(定义).map(([k, v]) => [k, 运行时定义.includes(k) ? '«运行时值»' : v])) }));
  }
};

/** 套在最外层（补缺字节占位 外面），让它看得到所有插件 */
export const 稳定缓存名 =
  (改写: WebpackOverrideFn): WebpackOverrideFn =>
  async (config) => {
    const c = await 改写(config);
    for (const p of c.plugins ?? []) 缓存名里去掉内容(p);
    return c;
  };
