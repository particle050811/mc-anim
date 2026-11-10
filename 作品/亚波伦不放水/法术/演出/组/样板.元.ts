// 样板组的元数据表（纯，段.ts 能引）。和 样板.tsx 一一对应，顺序一样。
import type { 法术元 } from '../接口.ts';
import 灵魂束 from '../法术/灵魂束.元.ts';
import 幽灵火 from '../法术/幽灵火.元.ts';
import 雷霆 from '../法术/雷霆.元.ts';

export const 样板元: readonly 法术元[] = [灵魂束, 幽灵火, 雷霆];
