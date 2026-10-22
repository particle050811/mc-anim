// 模块顶层要读的渲染设置（渲染级别等）。engine 不能 import engine/段/设置.ts，所以由 设置.ts 在模块顶层 设渲染设置(读设置())，
// 各处用 渲染输入() 取（代替旧代码的 getInputProps()）。注册.tsx 先 import 设置.ts、再取各段模块，所以先设后读。
// 正式渲染只有 级别 有值，旧代码里的调试键（supersample、lightPreset 等）一律 undefined，落到各自的默认值；见 风险.md R4。
let 当前: Record<string, unknown> = { 级别: '视频' };

export const 设渲染设置 = (设置: object) => {
  当前 = { ...设置 };
};

export const 渲染输入 = (): Record<string, unknown> => 当前;
