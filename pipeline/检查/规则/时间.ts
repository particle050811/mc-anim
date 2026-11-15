// 时间：段、场、库的画面代码按秒写（用户 11-06「不应该都是按函数那种写的吗」，docs/决策/0015-原生60帧.md），不直接调 useCurrentFrame()；
// 时间一律从 engine/段/时间.tsx 取（use当前秒、秒Sequence，核对视图用 use视图下标）。11-06 全迁完，没有例外（以前的 docs/帧号例外表.tsv 删了）。
// 只查 engine、库 和这次查的作品的渲染代码（不含测试）；时间工具自己（时间.tsx）不查。
import { isRenderCode, type CheckReport, type CheckContext } from '../上下文.ts';
import { parseSource, walk, lineNo, ts } from '../语法.ts';

const timeModules = new Set(['engine/段/时间.tsx']);

/** 一个文件里直接调 useCurrentFrame() 的行号 */
export const findFrameCallLines = (file: string, source: string): number[] => {
  if (!source.includes('useCurrentFrame')) return [];
  const sf = parseSource(file, source);
  const lineNumbers: number[] = [];
  walk(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useCurrentFrame') lineNumbers.push(lineNo(sf, n));
  });
  return lineNumbers;
};

export const time = (c: CheckContext, report: CheckReport) => {
  let fileCount = 0;
  for (const p of c.workFiles()) {
    if (!isRenderCode(p) || timeModules.has(p)) continue;
    fileCount++;
    const lineNumbers = findFrameCallLines(p, c.读(p));
    if (lineNumbers.length) report.错(`直接调 useCurrentFrame() ${lineNumbers.length} 处（第 ${lineNumbers.join('、')} 行）：按秒写，改用 engine/段/时间.tsx 的 use当前秒`, p, lineNumbers[0]);
  }
  report.infoLines.push(`查了 ${fileCount} 个渲染代码文件，时间都按秒取`);
};
