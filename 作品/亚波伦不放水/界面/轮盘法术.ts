// 多圈聚晶轮盘上放哪些法术、按什么顺序：从 法术/法术表.ts 选、排，再按 分圈.ts 落到各圈各格。纯模块（图标在 多圈轮盘.tsx 里按 聚晶键 取）。
import { 法术表, type 法术, type 法术学派 } from '../法术/法术表.ts';
import { 分圈, 落格, type 分法, type 圈形 } from './分圈.ts';

/** 放哪些：有画面 = 只放进齐放的（法术表里判成有画面的）；全部 = 有实现的全放（去掉 5 个空壳），不进齐放的图标压暗 */
export type 放哪些 = '有画面' | '全部';
/** 顺序：学派 = 同学派挨着连续排，学派之间照 Goety 的 SpellType 枚举顺序，学派内照注册顺序；注册 = 照法术表（两个模组注册物品的先后） */
export type 顺序 = '学派' | '注册';

/** com.Polarice3.Goety.api.magic.SpellType 的枚举顺序：NONE、NECROMANCY、NETHER、ILL、FROST、GEOMANCY、WIND、STORM、ABYSS、WILD、VOID（中文照 法术表 的学派译名） */
export const 学派顺序: readonly 法术学派[] = ['魔法', '死灵', '下界', '灾厄', '霜冻', '占卜', '烈风', '风暴', '深渊', '荒野', '虚空'];

export const 选法术 = (放: 放哪些): 法术[] => 法术表.filter((法) => (放 === '有画面' ? 法.类 === '有画面' : 法.类 !== '空壳'));

export const 排法术 = (法术们: readonly 法术[], 序: 顺序): 法术[] => (序 === '注册' ? [...法术们] : 学派顺序.flatMap((学派) => 法术们.filter((法) => 法.学派 === 学派)));

/** 聚晶图标.ts 的键：命名空间:注册名_focus */
export const 聚晶键 = (法: Pick<法术, '注册名' | '来源'>) => `${法.来源 === '本体' ? 'goety' : 'goety_revelation'}:${法.注册名}_focus`;

export type 轮盘项 = { 法: 法术; 键: string; 圈: number; 格: number; /** 进不进齐放（不进的在「全部」档里压暗） */ 齐放: boolean };

export type 排盘选项 = { 放?: 放哪些; 顺序?: 顺序; 分法?: 分法; 圈数?: number; 形?: 圈形 };

/** 选、排、分圈一次做完：每圈格数和每个法术落在哪一格 */
export const 排盘 = (选项: 排盘选项 = {}): { 每圈格数: number[]; 项: 轮盘项[] } => {
  const 法术们 = 排法术(选法术(选项.放 ?? '有画面'), 选项.顺序 ?? '学派');
  const 每圈格数 = 分圈(法术们.length, { 圈数: 选项.圈数, 分法: 选项.分法, 形: 选项.形 });
  const 位 = 落格(每圈格数);
  return { 每圈格数, 项: 法术们.map((法, i) => ({ 法, 键: 聚晶键(法), ...位[i]!, 齐放: 法.类 === '有画面' })) };
};
