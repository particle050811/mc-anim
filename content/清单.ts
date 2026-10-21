// 段清单：进成片的段按剪辑顺序排，sr render、sr film、注册.tsx 都读它（唯一顺序表）。纯数据。
// 段键是永久身份（<章>-<段名>，全片唯一，只用汉字、字母、数字和连字符），Composition id、目录名、母版缓存都用它；
// 编号（<章>-<两位序号>）按这里的顺序现算，只出现在产物里。核对段（键以 核对- 开头）放 content/核对/，不进章节编号。
export type 清单条目 = { 键: string; 章: number | '核对'; 集?: number };

export const 清单: readonly 清单条目[] = [{ 键: '核对-冒烟', 章: '核对' }];

/** 段目录（相对 content/） */
export const 段目录 = (键: string) => (键.startsWith('核对-') ? `核对/${键.slice('核对-'.length)}` : `段/${键}`);

/** 段名 = 段键去掉「<章>-」 */
export const 段名 = (条目: 清单条目) => 条目.键.slice(String(条目.章).length + 1);

/** 编号：章内按清单顺序的两位序号；核对段没有 */
export const 编号 = (键: string): string | null => {
  const 条目 = 清单.find((t) => t.键 === 键);
  if (!条目 || 条目.章 === '核对') return null;
  const 序 = 清单.filter((t) => t.章 === 条目.章).findIndex((t) => t.键 === 键) + 1;
  return `${条目.章}-${String(序).padStart(2, '0')}`;
};
