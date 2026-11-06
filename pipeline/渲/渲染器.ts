// 渲染入口和混音补丁必须绑定：Remotion 的 ESM 包内置另一份混音器，替换 CJS 导出对它无效。
// 只从这里取渲染函数；CJS download-map 在调用时读 makeInlineAudioMixing，才会用上固定次序。
// 测试要 mock 本文件；mock '@remotion/renderer' 拦不到 createRequire 加载的 CJS 渲染器。
import { createRequire } from 'node:module';
import { 固定混音顺序 } from './混音顺序.ts';

const 渲染器 = createRequire(import.meta.url)('@remotion/renderer') as typeof import('@remotion/renderer');
固定混音顺序();

export const { ensureBrowser, getCompositions, openBrowser, renderFrames, renderMedia, renderStill } = 渲染器;
export type { HeadlessBrowser, LogLevel } from '@remotion/renderer';
