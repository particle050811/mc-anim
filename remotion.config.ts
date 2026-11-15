// Remotion CLI（studio）的配置：只放入口、打包规则和 public 目录，和 anim render 共用 pipeline/资产/webpack.ts、pipeline/渲/public目录.ts。
// 不在这里设 CRF、并发、编码：那些是渲染设置，由 anim render 显式传入并记进指纹。anim render 不读这个文件（走 bundle 的 webpackOverride），所以它不进指纹。
// 数据根缺的字节打进占位、webpack 缓存名不随资产锁变，和 anim render 一样（pipeline/资产/缺字节.ts、缓存名.ts）。
import path from 'node:path';
import { Config } from '@remotion/cli/config';
import { webpackOverride } from './pipeline/资产/webpack.ts';
import { fillMissingBytePlaceholders } from './pipeline/资产/缺字节.ts';
import { stableCacheName } from './pipeline/资产/缓存名.ts';
import { ensurePublicDir } from './pipeline/渲/public目录.ts';
import { codeRoot } from './pipeline/环境/路径.ts';
import { workRoot } from './pipeline/环境/作品.ts';

Config.setEntryPoint(path.relative(codeRoot(), path.join(workRoot(), 'index.ts')));
Config.overrideWebpackConfig(stableCacheName(fillMissingBytePlaceholders(webpackOverride(workRoot()), workRoot())));
Config.setPublicDir(ensurePublicDir());
