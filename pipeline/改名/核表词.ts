// 核表要比的现成名字：全局名、Python 关键字和内置名（TS 保留字用 工程.ts 的 badNewName）。一律运行时从 globalThis、lib.dom.d.ts、python3 取，
// 不在代码里抄列表（抄长列表会被 API 的复述过滤拦下，前两个 Agent 就断在这）。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export type GlobalNames = {
  /** 函数、构造器：遮住了多半会出事，哪一层的绑定都报 */
  callable: Set<string>;
  /** 其余全局值（top、name、origin 这类）：只在模块顶层报 */
  plain: Set<string>;
  /** 全局类型（DOM 接口、内置类）：类型名撞了报 */
  types: Set<string>;
};

export const loadGlobals = (): GlobalNames => {
  const g: GlobalNames = { callable: new Set(), plain: new Set(), types: new Set() };
  for (const n of Object.getOwnPropertyNames(globalThis)) {
    if (!/^[A-Za-z_$][\w$]*$/.test(n)) continue;
    const v = (globalThis as Record<string, unknown>)[n];
    if (typeof v === 'function') {
      g.callable.add(n);
      if (/^[A-Z]/.test(n)) g.types.add(n);
    } else g.plain.add(n);
  }
  const lib = path.join(path.dirname(createRequire(import.meta.url).resolve('typescript')), 'lib.dom.d.ts');
  for (const line of fs.readFileSync(lib, 'utf8').split('\n')) {
    let m = /^declare var (\w+): (.*)$/.exec(line);
    if (m) {
      // `declare var X: {` 是带 prototype 的构造器；`typeof Y` 的别名同理
      (m[2]!.startsWith('{') || /^[A-Z]/.test(m[1]!) ? g.callable : g.plain).add(m[1]!);
      continue;
    }
    if ((m = /^declare function (\w+)/.exec(line))) g.callable.add(m[1]!);
    else if ((m = /^(?:interface|type) (\w+)/.exec(line))) g.types.add(m[1]!);
  }
  for (const n of g.callable) g.plain.delete(n);
  return g;
};

export type PythonNames = { keywords: Set<string>; builtins: Set<string> };

/** 没装 python3 就返回空表，Python 那批少查这两项 */
export const loadPythonNames = (): PythonNames => {
  try {
    const out = execFileSync('python3', ['-I', '-c', 'import builtins,json,keyword;print(json.dumps([keyword.kwlist+keyword.softkwlist,dir(builtins)]))'], {
      encoding: 'utf8',
    });
    const [kw, bi] = JSON.parse(out) as [string[], string[]];
    return { keywords: new Set(kw), builtins: new Set(bi.filter((n) => !n.startsWith('_'))) };
  } catch {
    return { keywords: new Set(), builtins: new Set() };
  }
};
