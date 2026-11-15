// anim 的入口（anim / anim.cmd 转到这里，Node 24 直接跑 TS）：拿命令表交给 路由.ts 分发，每条命令结束写运行记录、追加耗时。
import { commandTable } from './命令表.ts';
import { runCommandLine } from './路由.ts';

process.exitCode = await runCommandLine(process.argv.slice(2), { commandTable, env: process.env });
