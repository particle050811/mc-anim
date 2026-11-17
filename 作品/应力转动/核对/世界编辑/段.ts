// 世界编辑核对：看编辑层（sourcing/worlds/测试-修整-编辑示例.编辑.toml）烘进区段包以后在画面上生效没有：岛中间的石台、两间玻璃房、北边的石亭。
// 地形包没登记（只是演示），画面按版本直接取（地形.ts），所以这里 地形 写空。一个画面（0.05 秒，60 帧的 3 帧），从东南方斜上看过去。
import { checkSeg } from '@engine/段/核对段.ts';

export default checkSeg({ sec: 0.05 });
