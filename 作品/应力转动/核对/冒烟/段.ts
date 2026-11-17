// 冒烟段：不用任何受许可资产，只用 assets/registry/核对.toml 里的两件测试资产，证明 asset: 解析、png 内联、ogg 转 wav、母版、成片整条链路通。
import { checkSeg } from '@engine/段/核对段.ts';

export default checkSeg({ sec: 2 });
