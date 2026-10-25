// 私有配乐（第三方歌曲这类不随仓库发的）的地址：渲染代码不 import 它的字节，不打进 Remotion 的包，按资产 id 从 public 目录的 私有配乐/ 现取。
// anim render、anim studio 打包前按作品资产锁把 <数据根>/cache/私有配乐/<id> 备好（pipeline/资产/私有配乐.ts）：数据根 私有/ 里有字节就拷那份，
// 缺了换成盖得住所有 cue 的静音（docs/架构.md「私有内容缺失时：配乐换成静音」），公开仓库 clone 下来照样能渲，只是没歌。
// 只给按 段.ts cue 放的配乐用（作品的 配乐音轨.tsx）：指纹按本段 cue 里的私有配乐记「有字节（sha）/缺了换静音」，不按 cue 放的指纹记不到。
import { dataUrl } from '../core/数据源.ts';

export const 私有配乐 = (id: string) => dataUrl(`私有配乐/${id}`);
