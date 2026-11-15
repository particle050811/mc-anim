// 副作用模块：在本进程注册 别名钩子.ts（只注册一次）。cli/main.ts 第一个 import 它；清单/清单.ts 也 import，直接用 node 跑的脚本读段时同样认得别名。
import { register } from 'node:module';
import { codeRoot } from './路径.ts';

const ALIAS_HOOK_MARK = Symbol.for('mc-anim.别名钩子');
const g = globalThis as { [ALIAS_HOOK_MARK]?: true };
if (!g[ALIAS_HOOK_MARK]) {
  g[ALIAS_HOOK_MARK] = true;
  register('./别名钩子.ts', { parentURL: import.meta.url, data: { codeRoot: codeRoot() } });
}
