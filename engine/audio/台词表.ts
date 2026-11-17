// 台词表（资产 数据/配音/台词表 的内容）的形状和解析：纯数据，编排.ts 这种只排时刻的纯函数文件也能引，不连带 Remotion 的音频组件和配音 wav。
// 放声音的 台词轨.tsx 也从这里取。

export type LineEntry = { 字: string; 角色: string; 段: string; 文件: string | null; 时长: number; 开口: number; 有声长: number };

/** 资产 数据/配音/台词表 的内容 → 句 id 为键的表 */
export const parseLineTable = (rawLineTable: unknown) => rawLineTable as Record<string, LineEntry>;
