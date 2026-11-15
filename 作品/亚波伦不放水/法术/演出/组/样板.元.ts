// 样板组的元数据表（纯，段.ts 能引）。和 样板.tsx 一一对应，顺序一样。
import type { SpellMeta } from '../接口.ts';
import soulBeamMeta from '../法术/灵魂束.元.ts';
import ghostFireMeta from '../法术/幽灵火.元.ts';
import thunder from '../法术/雷霆.元.ts';

export const sampleMeta: readonly SpellMeta[] = [soulBeamMeta, ghostFireMeta, thunder];
