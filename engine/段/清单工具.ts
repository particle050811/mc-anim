// 作品 清单.ts 尾部的通用部分（段目录、段名、编号）：两部作品各抄了一份、逐字相同，新作品改用这里（旧的两份不动，改了让外壳指纹变）。纯模块。
// 用法：export const { 段目录, 段名, 编号 } = 清单工具(清单);  pipeline（清单/清单.ts、检查/内容.ts）照这三个导出读作品。
import type { 清单条目 } from './清单条目.ts';

export const 清单工具 = (清单: readonly 清单条目[]) => {
  /** 段目录（相对作品根）：核对段在 核对/<名>，其余在 段/<段键> */
  const 段目录 = (键: string) => (键.startsWith('核对-') ? `核对/${键.slice('核对-'.length)}` : `段/${键}`);
  /** 段名 = 段键去掉「<章>-」 */
  const 段名 = (条目: 清单条目) => 条目.键.slice(String(条目.章).length + 1);
  /** 编号：章内按清单顺序的两位序号；核对段没有 */
  const 编号 = (键: string): string | null => {
    const 条目 = 清单.find((t) => t.键 === 键);
    if (!条目 || 条目.章 === '核对') return null;
    const 序 = 清单.filter((t) => t.章 === 条目.章).findIndex((t) => t.键 === 键) + 1;
    return `${条目.章}-${String(序).padStart(2, '0')}`;
  };
  return { 段目录, 段名, 编号 };
};
