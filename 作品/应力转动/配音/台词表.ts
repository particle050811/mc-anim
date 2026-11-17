// 本作品的台词表（资产 数据/配音/台词表，旧 id 为键）：只排时刻的编排.ts 从这里取 lineTable，不连带 台词轨.tsx 里的配音 wav 和 Remotion 音频组件，
// 改一句配音的 wav 不会让只用开口、有声长的段跟着过期。
import lineTableJson from 'asset:数据/配音/台词表';
import { parseLineTable } from '@engine/audio/台词表.ts';

export const lineTable = parseLineTable(lineTableJson);
