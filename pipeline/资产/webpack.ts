// Remotion 打包（webpack）的改写：sr render 和 remotion.config.ts（studio）共用这一份。
// 1. `import x from 'asset:<id>'`：按资产锁换成数据根 store/、私有/ 里的文件，后缀放在 ?sr资产= 查询串里给下面的规则认（库里的文件没有后缀）；
//    锁里没有、字节不在，打包直接失败，报错里写该跑的命令。
// 2. 文件类型的规则照旧项目 remotion.config.ts：png 内联成 data URI（运行时同步解码，异步加载可能赶不上这一帧截图），
//    bin 原样拷出去，音频按内容哈希命名，ogg 解成 16 位 PCM 的 wav（原因见 ogg解码.cjs）。
// 3. 求解缓存的代码层指纹注入成 __SOLVER_FINGERPRINTS__（engine/core/求解缓存.ts 的 solverFingerprint）。
import crypto from 'node:crypto';
import path from 'node:path';
import type { WebpackConfiguration, WebpackOverrideFn } from '@remotion/bundler';
import webpack from 'webpack';
import { 配置 } from '../环境/配置.ts';
import { 代码根 } from '../环境/路径.ts';
import { 解析资产, 读资产锁 } from './资产锁.ts';
import { 算闭包, 稳定JSON } from '../指纹/指纹.ts';

type Rule = NonNullable<NonNullable<WebpackConfiguration['module']>['rules']>[number];
type Compiler = { hooks: { normalModuleFactory: { tap: (name: string, fn: (nmf: NMF) => void) => void } } };
type NMF = { hooks: { beforeResolve: { tap: (name: string, fn: (data: { request: string }) => void) => void } } };

const 查询键 = 'sr资产';

/** asset:<id> → <库文件>?sr资产=<后缀> */
export class 资产解析插件 {
  apply(compiler: Compiler) {
    const 锁 = 读资产锁();
    compiler.hooks.normalModuleFactory.tap('sr-资产', (nmf) => {
      nmf.hooks.beforeResolve.tap('sr-资产', (data) => {
        if (!data.request.startsWith('asset:')) return;
        const { 条目, 文件 } = 解析资产(data.request.slice('asset:'.length), 锁);
        data.request = `${文件}?${查询键}=${条目.后缀 || '.无后缀'}`;
      });
    });
  }
}

const 资产后缀 = (后缀: string) => new RegExp(`[?&]${查询键}=${后缀.replace('.', '\\.')}$`);

const 按内容命名 = (dir: string, 后缀: string) => ({ filename: `${dir}/[contenthash:16]${后缀}` });

export const ogg解码loader = () => ({ loader: path.join(代码根(), 'pipeline', '资产', 'ogg解码.cjs'), options: { ffmpeg: 配置('ffmpeg') } });

/** asset: 资产的规则：按查询串里的后缀分 */
const 资产规则 = (): Rule[] => [
  { resourceQuery: 资产后缀('.png'), type: 'asset/inline', generator: { dataUrl: { mimetype: 'image/png' } } },
  { resourceQuery: 资产后缀('.json'), type: 'json' },
  { resourceQuery: 资产后缀('.bin'), type: 'asset/resource', generator: 按内容命名('data', '.bin') },
  ...['.wav', '.m4a', '.mp3'].map((ext): Rule => ({ resourceQuery: 资产后缀(ext), type: 'asset/resource', generator: 按内容命名('audio', ext) })),
  { resourceQuery: 资产后缀('.ogg'), type: 'asset/resource', generator: 按内容命名('audio', '.wav'), use: [ogg解码loader()] },
  ...['.ttf', '.otf', '.woff', '.woff2', '.jpg', '.webp', '.mp4', '.txt'].map(
    (ext): Rule => ({ resourceQuery: 资产后缀(ext), type: 'asset/resource', generator: 按内容命名('assets', ext) }),
  ),
];

// 求解模块按依赖闭包（esbuild 列出的文件和资产的 sha）算指纹，闭包里任何一个文件改了缓存就失效；不手列文件，漏列会拿到过期结果。
// 算不出来（esbuild 报错）就不注入那一项，那个求解照常现算
const 求解入口: Record<string, string> = { 航线求解: 'content/场/6-暮色森林/一镜到底/航线求解.ts' };

export const 求解指纹 = async (): Promise<Record<string, string>> => {
  const 项 = await Promise.all(
    Object.entries(求解入口).map(async ([名, 入口]) => {
      try {
        return [[名, crypto.createHash('sha256').update(稳定JSON(await 算闭包([入口]))).digest('hex').slice(0, 16)] as const];
      } catch {
        return [];
      }
    }),
  );
  return Object.fromEntries(项.flat());
};

export const webpack改写: WebpackOverrideFn = async (config) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    new 资产解析插件(),
    // webpack 就是 @remotion/bundler 用的那份（它不自带，取的是这里 node_modules/webpack）
    new webpack.DefinePlugin({ __SOLVER_FINGERPRINTS__: JSON.stringify(await 求解指纹()) }),
  ],
  module: {
    ...config.module,
    rules: [
      // Remotion 默认把 png、音频当异步加载的文件，先摘出来
      ...(config.module?.rules ?? []).map((rule) => {
        if (rule && typeof rule === 'object' && rule.test instanceof RegExp && rule.test.test('a.png')) {
          return { ...rule, exclude: /\.(png|m4a|wav|ogg)$/ };
        }
        return rule;
      }),
      { test: /\.png$/, type: 'asset/inline' },
      { test: /\.bin$/, type: 'asset/resource' },
      // 项目外的文件按 [path] 命名会得到取不到的 "../…" 地址，音频统一按内容哈希命名
      { test: /\.(m4a|wav)$/, type: 'asset/resource', generator: { filename: 'audio/[contenthash:16][ext]' } },
      { test: /\.ogg$/, type: 'asset/resource', generator: { filename: 'audio/[contenthash:16].wav' }, use: [ogg解码loader()] },
      ...资产规则(),
    ],
  },
});
