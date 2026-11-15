// anim 的命令行路由（main.ts 只接线）：取全局参数（--作品、--调试）、按子命令分发、出错时怎么报、写运行记录。
// 报错：预期内的（用法错、选不出作品、我们自己 throw new Error 的业务错、esbuild 构建失败）只打信息不打调用栈，加 --调试 才打；
// 别的（TypeError 这类、库里抛的）照旧打调用栈。调用栈总记进运行记录，事后能查。
import path from 'node:path';
import {SchedYieldError} from '../闸/指令.ts';
import {openTask,resolveSchedulerEnv} from '../闸/任务.ts';
import { fileURLToPath } from 'node:url';
import { UsageError } from './参数.ts';
import type { Command } from './命令.ts';
import { codeRoot } from '../环境/路径.ts';
import { parseWorkArg, currentWork, setSpecifiedWork, WorkSelectError } from '../环境/作品.ts';
import { RunRecord, utcTime } from '../运行记录/记录.ts';

export type Output = { log: (s: string) => void; error: (s: string) => void };
export type RouteOptions = {
  commandTable: Record<string, Command>;
  /** 测试换成不写盘的 */
  newRecord?: (commandName: string, args: string[]) => RunRecord;
  输出?: Output;
  /** ANIM_DEBUG=1 和 --调试 一样 */
  env?: NodeJS.ProcessEnv;
};

/** 从参数里取出 --调试（-- 之后的不管），返回剩下的 */
export const takeDebugArgs = (args: readonly string[]): { debug: boolean; rest: string[] } => {
  const sepIndex = args.indexOf('--');
  const head = sepIndex < 0 ? args : args.slice(0, sepIndex);
  return { debug: head.includes('--调试'), rest: [...head.filter((a) => a !== '--调试'), ...(sepIndex < 0 ? [] : args.slice(sepIndex))] };
};

/** 低优先（用户 11-06 定：子 Agent 只出静帧，整段渲染由主 Agent 合并后用 --低优先 排，给静帧让路）：
 *  取走 --低优先，设 ANIM_PRIORITY=low，这条命令和它起的子进程过闸都排在普通票后面（闸/票.ts 领票） */
export const lowPriorityEnv = 'ANIM_PRIORITY';
export const takeLowPriorityArgs = (args: readonly string[]): { 低优先: boolean; rest: string[] } => {
  const sepIndex = args.indexOf('--');
  const head = sepIndex < 0 ? args : args.slice(0, sepIndex);
  return { 低优先: head.includes('--低优先'), rest: [...head.filter((a) => a !== '--低优先'), ...(sepIndex < 0 ? [] : args.slice(sepIndex))] };
};

const builtinErrors = [TypeError, RangeError, ReferenceError, SyntaxError, EvalError, URIError];

/** 调用栈第一帧的文件（file:// 地址转成路径）；取不到返回 null */
export const firstFrameFile = (stack: string | undefined): string | null => {
  const stackFrame = stack?.split('\n').find((l) => /^\s+at /.test(l));
  const m = stackFrame && /\(?((?:file:\/\/)?[^()\s]+?):\d+:\d+\)?\s*$/.exec(stackFrame);
  if (!m) return null;
  try {
    return m[1]!.startsWith('file://') ? fileURLToPath(m[1]!) : m[1]!;
  } catch {
    return null;
  }
};

/** 预期内的错：只打信息就够，调用栈帮不上忙 */
export const isExpectedError = (e: unknown, root = codeRoot()): boolean => {
  if (e instanceof UsageError || e instanceof WorkSelectError) return true;
  if (!(e instanceof Error) || builtinErrors.some((c) => e instanceof c)) return false;
  // esbuild 构建失败：报错文本里已经有文件和行号
  if (Array.isArray((e as { errors?: unknown }).errors) && Array.isArray((e as { warnings?: unknown }).warnings)) return true;
  const f = firstFrameFile(e.stack);
  // node:fs 这类内置模块的帧不是路径（按相对路径算会随 cwd 落进仓库里），算库里抛的
  if (!f || !path.isAbsolute(f)) return false;
  const relPath = path.relative(root, f);
  return !relPath.startsWith('..') && !path.isAbsolute(relPath) && !relPath.split(path.sep).includes('node_modules');
};

export const helpText = (commandTable: Record<string, Command>) =>
  ['用法：anim [--作品 <名>] [--调试] [--低优先] <命令> [参数]\n', ...Object.values(commandTable).map((c) => `  anim ${c.用法}\n      ${c.说明}`)].join('\n');

/** 一条命令的帮助：自带的详细帮助，没有就是 用法 和 说明 */
export const commandHelp = (c: Command) => c.help?.() ?? `用法：anim ${c.用法}\n      ${c.说明}`;

/** 子命令后面带了 --help 或 -h（-- 之后的不算）：段键、段名都不以 - 开头，不会和选择器撞 */
export const wantsHelp = (args: readonly string[]) => {
  const sepIndex = args.indexOf('--');
  return (sepIndex < 0 ? args : args.slice(0, sepIndex)).some((a) => a === '--help' || a === '-h');
};

/** 跑一条 anim 命令，返回退出码 */
export const runCommandLine = async (argv: readonly string[], o: RouteOptions): Promise<number> => {
  const sink = o.输出 ?? { log: (s) => console.log(s), error: (s) => console.error(s) };
  const { 低优先: lowPriority, rest: withoutLowPriority } = takeLowPriorityArgs(argv);
  if (lowPriority) process.env[lowPriorityEnv] = 'low';
  const { debug: addedDebug, rest: withoutDebug } = takeDebugArgs(withoutLowPriority);
  const debug = addedDebug || o.env?.ANIM_DEBUG === '1';
  // --作品 对所有命令都有效，这里统一取走（选作品的顺序见 环境/作品.ts）
  let parsed: ReturnType<typeof parseWorkArg>;
  try {
    parsed = parseWorkArg(withoutDebug);
    setSpecifiedWork(parsed.作品);
    if (parsed.作品) currentWork();
  } catch (e) {
    sink.error((e as Error).message);
    return 2;
  }
  const [commandName, ...args] = parsed.rest;
  if (!commandName || commandName === 'help' || commandName === '--help' || commandName === '-h') {
    const topic = commandName === 'help' && args[0] !== undefined ? o.commandTable[args[0]] : undefined;
    sink.log(topic ? commandHelp(topic) : helpText(o.commandTable));
    return commandName ? 0 : 1;
  }
  const c = o.commandTable[commandName];
  if (!c) {
    sink.error(`没有 ${commandName} 这个命令`);
    sink.log(helpText(o.commandTable));
    return 1;
  }
  if (!c.passThrough && wantsHelp(args)) {
    sink.log(commandHelp(c));
    return 0;
  }
  const runRecord = (o.newRecord ?? ((n, a) => new RunRecord(n, a)))(commandName, args);
  const task = !c.noRecord && !o.newRecord && /^(still|bench|verify|film|extract|world|mcai|voice|cache|批)$/.test(commandName) ? openTask(resolveSchedulerEnv(), {种:commandName,用途:process.env.ANIM_PURPOSE??'未声明'}, code=>runRecord.结束(code)) : null;
  if(task)runRecord.任务=task.info.任务;
  let code = 1, errorText: string | undefined;
  try {
    code = (await c.跑(args, runRecord)) ?? 0;
  } catch (e) {
    const stack = e instanceof Error ? e.stack : undefined;
    const errorMessage = e instanceof Error ? e.message : String(e);
    errorText = errorMessage.slice(0, 200);
    if(e instanceof SchedYieldError){sink.error(`调度让路：${errorMessage}；不算失败，不要原样重发`);code=75;} else if (e instanceof WorkSelectError) {
      sink.error(errorMessage);
      code = 2;
    } else if (e instanceof UsageError) {
      sink.error(`${errorMessage}\n用法：anim ${c.用法}`);
      code = 2;
    } else {
      sink.error(debug || !isExpectedError(e) ? (stack ?? errorMessage) : `✗ ${errorMessage}`);
      code = 1;
    }
    if (debug && stack && (e instanceof WorkSelectError || e instanceof UsageError)) sink.error(stack);
    // 上面已打过，不经 记录.记 再打一遍；调用栈总记下
    runRecord.事件.push({ 时间: utcTime(), 级别: '错误', 文本: errorMessage, ...(stack ? { 调用栈: stack } : {}) });
  }
  if(task)task.结束(code,undefined,errorText);
  else if (!c.noRecord) runRecord.结束(code);
  return code;
};
