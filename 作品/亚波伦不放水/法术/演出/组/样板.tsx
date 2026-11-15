// 样板组的演出表。和 样板.元.ts 一一对应，顺序一样。
import type { SpellPerformanceEntry } from '../定义.tsx';
import SoulBeam from '../法术/灵魂束.tsx';
import GhostFire from '../法术/幽灵火.tsx';
import thunder from '../法术/雷霆.tsx';

export const samplePerformance: readonly SpellPerformanceEntry[] = [SoulBeam, GhostFire, thunder];
