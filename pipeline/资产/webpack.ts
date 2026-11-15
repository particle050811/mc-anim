// Remotion 打包（webpack）的改写：anim film、still 和 remotion.config.ts（studio）共用这一份，按作品根各出一份（webpack改写(作品根)）。
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
import { config } from '../环境/配置.ts';
import { codeRoot } from '../环境/路径.ts';
import { aliasDir } from '../环境/别名.ts';
import { resolveAsset, readWorkAssetLock, type AssetLock } from './资产锁.ts';
import { solveFingerprints } from '../指纹/求解指纹.ts';

type Rule = NonNullable<NonNullable<WebpackConfiguration['module']>['rules']>[number];
type Compiler = { hooks: { normalModuleFactory: { tap: (name: string, fn: (nmf: NMF) => void) => void } } };
type NMF = { hooks: { beforeResolve: { tap: (name: string, fn: (data: { request: string }) => void) => void } } };

const queryKey = 'anim资产';

/** asset:<id> → <库文件>?anim资产=<后缀> */
export class AssetResolvePlugin {
  readonly assetLock: AssetLock;
  constructor(assetLock: AssetLock) {
    this.assetLock = assetLock;
  }
  apply(compiler: Compiler) {
    const assetLock = this.assetLock;
    compiler.hooks.normalModuleFactory.tap('anim-资产', (nmf) => {
      nmf.hooks.beforeResolve.tap('anim-资产', (data) => {
        if (!data.request.startsWith('asset:')) return;
        const { entry, 文件: file } = resolveAsset(data.request.slice('asset:'.length), assetLock);
        data.request = `${file}?${queryKey}=${entry.后缀 || '.无后缀'}`;
      });
    });
  }
}

const assetSuffixMatcher = (suffix: string) => new RegExp(`[?&]${queryKey}=${suffix.replace('.', '\\.')}$`);

const contentHashName = (dir: string, suffix: string) => ({ filename: `${dir}/[contenthash:16]${suffix}` });

export const oggDecodeLoader = () => ({ loader: path.join(codeRoot(), 'pipeline', '资产', 'ogg解码.cjs'), options: { ffmpeg: config('ffmpeg') } });

/** asset: 资产的规则：按查询串里的后缀分 */
const assetRules = (): Rule[] => [
  { resourceQuery: assetSuffixMatcher('.png'), type: 'asset/inline', generator: { dataUrl: { mimetype: 'image/png' } } },
  { resourceQuery: assetSuffixMatcher('.json'), type: 'json' },
  { resourceQuery: assetSuffixMatcher('.bin'), type: 'asset/resource', generator: contentHashName('data', '.bin') },
  ...['.wav', '.m4a', '.mp3'].map((ext): Rule => ({ resourceQuery: assetSuffixMatcher(ext), type: 'asset/resource', generator: contentHashName('audio', ext) })),
  { resourceQuery: assetSuffixMatcher('.ogg'), type: 'asset/resource', generator: contentHashName('audio', '.wav'), use: [oggDecodeLoader()] },
  ...['.ttf', '.otf', '.woff', '.woff2', '.jpg', '.webp', '.mp4', '.txt'].map(
    (ext): Rule => ({ resourceQuery: assetSuffixMatcher(ext), type: 'asset/resource', generator: contentHashName('assets', ext) }),
  ),
];

export const webpackOverride = (workRoot: string): WebpackOverrideFn => async (config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: { ...(config.resolve?.alias as Record<string, string> | undefined), ...aliasDir(codeRoot()) },
    modules: [path.join(codeRoot(), 'node_modules'), 'node_modules'],
  },
  plugins: [
    ...(config.plugins ?? []),
    new AssetResolvePlugin(readWorkAssetLock(workRoot)),
    // webpack 就是 @remotion/bundler 用的那份（它不自带，取的是这里 node_modules/webpack）
    new webpack.DefinePlugin({ __SOLVER_FINGERPRINTS__: JSON.stringify(await solveFingerprints(workRoot)) }),
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
      { test: /\.ogg$/, type: 'asset/resource', generator: { filename: 'audio/[contenthash:16].wav' }, use: [oggDecodeLoader()] },
      // 锁定的媒体组件在同页跳帧时会撞到 V8 的字面量迁移断言；只改构造方式，声音参数不动。
      { test: /[\\/]@remotion[\\/]media[\\/]dist[\\/]esm[\\/]index\.mjs$/, use: [{ loader: path.join(codeRoot(), 'pipeline', '资产', '媒体字面量.cjs') }] },
      ...assetRules(),
    ],
  },
});
