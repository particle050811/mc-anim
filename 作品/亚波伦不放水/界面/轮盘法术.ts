// 多圈聚晶轮盘上放哪些法术、按什么顺序：从 法术/法术表.ts 选、排，再按 分圈.ts 落到各圈各格。纯模块（图标在 多圈轮盘.tsx 里按 聚晶键 取）。
import { spellTable, type Spell, type SpellSchool } from '../法术/法术表.ts';
import { splitRings, placeCells, type SplitMode, type RingShape } from './分圈.ts';

/** 放哪些：有画面 = 只放进齐放的（法术表里判成有画面的）；全部 = 有实现的全放（去掉 5 个空壳），不进齐放的图标压暗 */
export type SpellFilter = '有画面' | '全部';
/** 顺序：学派 = 同学派挨着连续排，学派之间照 Goety 的 SpellType 枚举顺序，学派内照注册顺序；注册 = 照法术表（两个模组注册物品的先后） */
export type SortMode = '学派' | '注册';

/** com.Polarice3.Goety.api.magic.SpellType 的枚举顺序：NONE、NECROMANCY、NETHER、ILL、FROST、GEOMANCY、WIND、STORM、ABYSS、WILD、VOID（中文照 法术表 的学派译名） */
export const schoolOrder: readonly SpellSchool[] = ['魔法', '死灵', '下界', '灾厄', '霜冻', '占卜', '烈风', '风暴', '深渊', '荒野', '虚空'];

export const pickSpells = (spellSet: SpellFilter): Spell[] => spellTable.filter((spell) => (spellSet === '有画面' ? spell.类 === '有画面' : spell.类 !== '空壳'));

export const sortSpells = (spells: readonly Spell[], sortMode: SortMode): Spell[] => (sortMode === '注册' ? [...spells] : schoolOrder.flatMap((school) => spells.filter((spell) => spell.school === school)));

/** 聚晶图标.ts 的键：命名空间:注册名_focus */
export const focusKey = (spell: Pick<Spell, 'registryName' | '来源'>) => `${spell.来源 === '本体' ? 'goety' : 'goety_revelation'}:${spell.registryName}_focus`;

export type WheelItem = { 法: Spell; key: string; ring: number; cell: number; /** 进不进齐放（不进的在「全部」档里压暗） */ inReveal: boolean };

export type ArrangeOptions = { 放?: SpellFilter; sortMode?: SortMode; splitMode?: SplitMode; ringCount?: number; ringShape?: RingShape };

/** 选、排、分圈一次做完：每圈格数和每个法术落在哪一格 */
export const arrangeWheel = (options: ArrangeOptions = {}): { cellsPerRing: number[]; items: WheelItem[] } => {
  const spells = sortSpells(pickSpells(options.放 ?? '有画面'), options.sortMode ?? '学派');
  const cellsPerRing = splitRings(spells.length, { ringCount: options.ringCount, splitMode: options.splitMode, ringShape: options.ringShape });
  const slotPos = placeCells(cellsPerRing);
  return { cellsPerRing, items: spells.map((spell, i) => ({ 法: spell, key: focusKey(spell), ...slotPos[i]!, inReveal: spell.类 === '有画面' })) };
};
