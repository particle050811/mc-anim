// 时间：段、场、库的画面代码按秒写（用户 11-06「不应该都是按函数那种写的吗」，docs/决策/0015-原生60帧.md），不直接调 useCurrentFrame()；
// 时间一律从 engine/段/时间.tsx 取（use当前秒、秒Sequence，核对视图用 use视图下标）。11-06 全迁完，没有例外（以前的 docs/帧号例外表.tsv 删了）。
// 只查 engine、库 和这次查的作品的渲染代码（不含测试）；时间工具自己（时间.tsx）不查。
import { 是渲染代码, type 报告, type 检查上下文 } from '../上下文.ts';
import { 解析, 遍历, 行号, ts } from '../语法.ts';

const 时间工具 = new Set(['engine/段/时间.tsx']);

/** 一个文件里直接调 useCurrentFrame() 的行号 */
export const 查文件 = (文件: string, 源码: string): number[] => {
  if (!源码.includes('useCurrentFrame')) return [];
  const sf = 解析(文件, 源码);
  const 行们: number[] = [];
  遍历(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useCurrentFrame') 行们.push(行号(sf, n));
  });
  return 行们;
};

export const 时间 = (c: 检查上下文, 报: 报告) => {
  let 文件数 = 0;
  for (const p of c.本作品文件()) {
    if (!是渲染代码(p) || 时间工具.has(p)) continue;
    文件数++;
    const 行们 = 查文件(p, c.读(p));
    if (行们.length) 报.错(`直接调 useCurrentFrame() ${行们.length} 处（第 ${行们.join('、')} 行）：按秒写，改用 engine/段/时间.tsx 的 use当前秒`, p, 行们[0]);
  }
  报.信息.push(`查了 ${文件数} 个渲染代码文件，时间都按秒取`);
};
