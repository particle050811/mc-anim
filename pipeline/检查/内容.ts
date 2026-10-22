// 检查用的内容视图：执行所查作品的 清单.ts 和各段 段.ts（纯模块），按清单顺序给出每段的定义；场键的先后按清单里第一次出现排。
import type { 段定义 } from '../../engine/段/段定义.ts';
import type { 检查上下文 } from './上下文.ts';

export type 清单行 = { 键: string; 章: number | '核对'; 集?: number };
export type 段项 = 清单行 & { 目录: string; 段文件: string; 定义?: 段定义; 错误?: string };
export type 内容 = { 段们: 段项[]; 场序: string[] } | { 错误: string };

const 缓存 = new WeakMap<检查上下文, Promise<内容>>();

export const 读内容 = (c: 检查上下文): Promise<内容> => {
  let r = 缓存.get(c);
  if (!r) {
    r = (async (): Promise<内容> => {
      const 清单文件 = c.作品路径('清单.ts');
      if (!c.存在(清单文件)) return { 错误: `没有 ${清单文件}` };
      const m = await c.加载(清单文件);
      if (!m.模块) return { 错误: `${清单文件} 执行出错：${m.错误}` };
      const 清单 = m.模块.清单 as 清单行[] | undefined;
      const 段目录 = m.模块.段目录 as ((键: string) => string) | undefined;
      if (!Array.isArray(清单) || typeof 段目录 !== 'function') return { 错误: `${清单文件} 要导出 清单 数组和 段目录 函数` };
      const 段们: 段项[] = [];
      for (const t of 清单) {
        const 目录 = c.作品路径(段目录(t.键));
        const 段文件 = `${目录}/段.ts`;
        const 项: 段项 = { ...t, 目录, 段文件 };
        if (!c.存在(段文件)) 项.错误 = `缺 ${段文件}`;
        else {
          const d = await c.加载(段文件);
          if (!d.模块) 项.错误 = `${段文件} 执行出错：${d.错误}`;
          else if (!d.模块.default) 项.错误 = `${段文件} 没有 export default 定义段(...)`;
          else 项.定义 = d.模块.default as 段定义;
        }
        段们.push(项);
      }
      const 场序: string[] = [];
      for (const s of 段们) if (s.定义 && s.定义.场 !== '核对' && !场序.includes(s.定义.场)) 场序.push(s.定义.场);
      return { 段们, 场序 };
    })();
    缓存.set(c, r);
  }
  return r;
};

/** 所查作品的 段/、场/、核对/ 下实际有的目录名 */
export const 实有目录 = (c: 检查上下文, 层: '段' | '场' | '核对') => {
  const 前缀 = c.作品路径(`${层}/`);
  return [...new Set(c.文件().filter((p) => p.startsWith(前缀) && p.slice(前缀.length).includes('/')).map((p) => p.slice(前缀.length).split('/')[0]!))].sort();
};
