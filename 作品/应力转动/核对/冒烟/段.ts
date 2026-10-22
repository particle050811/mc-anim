// 冒烟段：不用任何受许可资产，只用 assets/registry/核对.toml 里的两件测试资产，证明 asset: 解析、png 内联、ogg 转 wav、母版、成片整条链路通。
import { 定义段 } from '@engine/段/段定义.ts';

export default 定义段({ 场: '核对', 帧数: 48, fps: 24, 宽: 1280, 高: 720, 地形: [] });
