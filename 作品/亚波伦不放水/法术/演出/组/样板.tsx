// 样板组的演出表。和 样板.ts 一一对应，顺序一样。
import type { 法术演出条 } from '../定义.tsx';
import 灵魂束 from '../法术/灵魂束.tsx';
import 幽灵火 from '../法术/幽灵火.tsx';
import 雷霆 from '../法术/雷霆.tsx';

export const 样板演出: readonly 法术演出条[] = [灵魂束, 幽灵火, 雷霆];
