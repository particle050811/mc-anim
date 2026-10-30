// Remotion CLI（studio）的配置：只放入口、打包规则和 public 目录，和 anim render 共用 pipeline/资产/webpack.ts、pipeline/渲/public目录.ts。
// 不在这里设 CRF、并发、编码：那些是渲染设置，由 anim render 显式传入并记进指纹。anim render 不读这个文件（走 bundle 的 webpackOverride），所以它不进指纹。
// 数据根缺的字节打进占位、webpack 缓存名不随资产锁变，和 anim render 一样（pipeline/资产/缺字节.ts、缓存名.ts）。
import path from 'node:path';
import { Config } from '@remotion/cli/config';
import { webpack改写 } from './pipeline/资产/webpack.ts';
import { 补缺字节占位 } from './pipeline/资产/缺字节.ts';
import { 稳定缓存名 } from './pipeline/资产/缓存名.ts';
import { 备好public目录 } from './pipeline/渲/public目录.ts';
import { 代码根 } from './pipeline/环境/路径.ts';
import { 作品根 } from './pipeline/环境/作品.ts';

Config.setEntryPoint(path.relative(代码根(), path.join(作品根(), 'index.ts')));
Config.overrideWebpackConfig(稳定缓存名(补缺字节占位(webpack改写(作品根()), 作品根())));
Config.setPublicDir(备好public目录());
