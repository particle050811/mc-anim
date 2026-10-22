// Remotion CLI（studio）的配置：只放入口、打包规则和 public 目录，和 anim render 共用 pipeline/资产/webpack.ts、pipeline/渲/public目录.ts。
// 不在这里设 CRF、并发、编码：那些是渲染设置，由 anim render 显式传入并记进指纹。anim render 不读这个文件（走 bundle 的 webpackOverride），所以它不进指纹。
import path from 'node:path';
import { Config } from '@remotion/cli/config';
import { webpack改写 } from './pipeline/资产/webpack.ts';
import { 备好public目录 } from './pipeline/渲/public目录.ts';
import { 代码根, 作品根 } from './pipeline/环境/路径.ts';

Config.setEntryPoint(path.relative(代码根(), path.join(作品根(), 'index.ts')));
Config.overrideWebpackConfig(webpack改写(作品根()));
Config.setPublicDir(备好public目录());
