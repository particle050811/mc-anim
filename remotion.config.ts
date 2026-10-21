// Remotion CLI（studio）的配置：只放打包规则和 public 目录，和 sr render 共用 pipeline/资产/webpack.ts、pipeline/渲/public目录.ts。
// 不在这里设 CRF、并发、编码：那些是渲染设置，由 sr render 显式传入并记进指纹。
import { Config } from '@remotion/cli/config';
import { webpack改写 } from './pipeline/资产/webpack.ts';
import { 备好public目录 } from './pipeline/渲/public目录.ts';

Config.setEntryPoint('content/index.ts');
Config.overrideWebpackConfig(webpack改写);
Config.setPublicDir(备好public目录());
