// 冒烟段：不用任何受许可资产，只用 assets/registry/核对.toml 里的两件测试资产，证明 asset: 解析、png 内联、ogg 转 wav、母版、成片整条链路通。
import { defineSeg } from '@engine/段/段定义.ts';

export default defineSeg({ scene: '核对', sec: 2, width: 1280, height: 720, terrain: [] });
