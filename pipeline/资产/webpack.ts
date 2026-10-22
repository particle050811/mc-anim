// Remotion 打包（webpack）的改写：anim render 和 remotion.config.ts（studio）共用这一份，按作品根各出一份（webpack改写(作品根)）。
// 本文件的文本进段指纹的「打包规则」，所以按作品变的东西（资产锁、求解入口）都在别处现读，这里只接线，加作品、挪作品不用改它。
// 1. `import x from 'asset:<id>'`：按作品的资产锁（读作品资产锁）换成数据根 store/、私有/ 里的文件，后缀放在 ?anim资产= 查询串里给下面的规则认（库里的文件没有后缀）；
//    锁里没有、字节不在，打包直接失败，报错里写该跑的命令。
// 2. 文件类型的规则照旧项目 remotion.config.ts：png 内联成 data URI（运行时同步解码，异步加载可能赶不上这一帧截图），
//    bin 原样拷出去，音频按内容哈希命名，ogg 解成 16 位 PCM 的 wav（原因见 ogg解码.cjs）。
// 3. 求解缓存的代码层指纹注入成 __SOLVER_FINGERPRINTS__（engine/core/求解缓存.ts 的 solverFingerprint；入口由作品的 清单.ts 导出，见 指纹/求解指纹.ts）。
// 4. 解析：@engine/、@库/ 别名（环境/别名.ts）；npm 包先找代码根的 node_modules，仓库外的作品也用这一份（three 只能有一份）。
import path from 'node:path';
import type { WebpackConfiguration, WebpackOverrideFn } from '@remotion/bundler';
import webpack from 'webpack';
import { 配置 } from '../环境/配置.ts';
import { 代码根 } from '../环境/路径.ts';
import { 别名目录 } from '../环境/别名.ts';
import { 解析资产, 读作品资产锁, type 资产锁 } from './资产锁.ts';
import { 求解指纹 } from '../指纹/求解指纹.ts';

type Rule = NonNullable<NonNullable<WebpackConfiguration['module']>['rules']>[number];
type Compiler = { hooks: { normalModuleFactory: { tap: (name: string, fn: (nmf: NMF) => void) => void } } };
type NMF = { hooks: { beforeResolve: { tap: (name: string, fn: (data: { request: string }) => void) => void } } };

const 查询键 = 'anim资产';

/** asset:<id> → <库文件>?anim资产=<后缀> */
export class 资产解析插件 {
  readonly 锁: 资产锁;
  constructor(锁: 资产锁) {
    this.锁 = 锁;
  }
  apply(compiler: Compiler) {
    const 锁 = this.锁;
    compiler.hooks.normalModuleFactory.tap('anim-资产', (nmf) => {
      nmf.hooks.beforeResolve.tap('anim-资产', (data) => {
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

export const webpack改写 = (作品根: string): WebpackOverrideFn => async (config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: { ...(config.resolve?.alias as Record<string, string> | undefined), ...别名目录(代码根()) },
    modules: [path.join(代码根(), 'node_modules'), 'node_modules'],
  },
  plugins: [
    ...(config.plugins ?? []),
    new 资产解析插件(读作品资产锁(作品根)),
    // webpack 就是 @remotion/bundler 用的那份（它不自带，取的是这里 node_modules/webpack）
    new webpack.DefinePlugin({ __SOLVER_FINGERPRINTS__: JSON.stringify(await 求解指纹(作品根)) }),
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
