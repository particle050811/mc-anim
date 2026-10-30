// anim 的命令行路由（main.ts 只接线）：取全局参数（--作品、--调试）、按子命令分发、出错时怎么报、写运行记录。
// 报错：预期内的（用法错、选不出作品、我们自己 throw new Error 的业务错、esbuild 构建失败）只打信息不打调用栈，加 --调试 才打；
// 别的（TypeError 这类、库里抛的）照旧打调用栈。调用栈总记进运行记录，事后能查。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 用法错误 } from './参数.ts';
import type { 命令 } from './命令.ts';
import { 代码根 } from '../环境/路径.ts';
import { 取作品参数, 当前作品, 指定作品, 选作品错误 } from '../环境/作品.ts';
import { 运行记录, utc时间 } from '../运行记录/记录.ts';

export type 输出 = { log: (s: string) => void; error: (s: string) => void };
export type 路由选项 = {
  命令表: Record<string, 命令>;
  /** 测试换成不写盘的 */
  新记录?: (名: string, args: string[]) => 运行记录;
  输出?: 输出;
  /** ANIM_DEBUG=1 和 --调试 一样 */
  环境变量?: NodeJS.ProcessEnv;
};

/** 从参数里取出 --调试（-- 之后的不管），返回剩下的 */
export const 取调试参数 = (args: readonly string[]): { 调试: boolean; 其余: string[] } => {
  const 停 = args.indexOf('--');
  const 前 = 停 < 0 ? args : args.slice(0, 停);
  return { 调试: 前.includes('--调试'), 其余: [...前.filter((a) => a !== '--调试'), ...(停 < 0 ? [] : args.slice(停))] };
};

const 内置错误 = [TypeError, RangeError, ReferenceError, SyntaxError, EvalError, URIError];

/** 调用栈第一帧的文件（file:// 地址转成路径）；取不到返回 null */
export const 首帧文件 = (stack: string | undefined): string | null => {
  const 帧 = stack?.split('\n').find((l) => /^\s+at /.test(l));
  const m = 帧 && /\(?((?:file:\/\/)?[^()\s]+?):\d+:\d+\)?\s*$/.exec(帧);
  if (!m) return null;
  try {
    return m[1]!.startsWith('file://') ? fileURLToPath(m[1]!) : m[1]!;
  } catch {
    return null;
  }
};

/** 预期内的错：只打信息就够，调用栈帮不上忙 */
export const 是预期错误 = (e: unknown, 根 = 代码根()): boolean => {
  if (e instanceof 用法错误 || e instanceof 选作品错误) return true;
  if (!(e instanceof Error) || 内置错误.some((c) => e instanceof c)) return false;
  // esbuild 构建失败：报错文本里已经有文件和行号
  if (Array.isArray((e as { errors?: unknown }).errors) && Array.isArray((e as { warnings?: unknown }).warnings)) return true;
  const f = 首帧文件(e.stack);
  if (!f) return false;
  const 相对 = path.relative(根, f);
  return !相对.startsWith('..') && !path.isAbsolute(相对) && !相对.split(path.sep).includes('node_modules');
};

export const 帮助文本 = (命令表: Record<string, 命令>) =>
  ['用法：anim [--作品 <名>] [--调试] <命令> [参数]\n', ...Object.values(命令表).map((c) => `  anim ${c.用法}\n      ${c.说明}`)].join('\n');

/** 跑一条 anim 命令，返回退出码 */
export const 跑命令行 = async (argv: readonly string[], o: 路由选项): Promise<number> => {
  const 出 = o.输出 ?? { log: (s) => console.log(s), error: (s) => console.error(s) };
  const { 调试: 加了调试, 其余: 去调试 } = 取调试参数(argv);
  const 调试 = 加了调试 || o.环境变量?.ANIM_DEBUG === '1';
  // --作品 对所有命令都有效，这里统一取走（选作品的顺序见 环境/作品.ts）
  let 拆: ReturnType<typeof 取作品参数>;
  try {
    拆 = 取作品参数(去调试);
    指定作品(拆.作品);
    if (拆.作品) 当前作品();
  } catch (e) {
    出.error((e as Error).message);
    return 2;
  }
  const [名, ...args] = 拆.其余;
  if (!名 || 名 === 'help' || 名 === '--help' || 名 === '-h') {
    出.log(帮助文本(o.命令表));
    return 名 ? 0 : 1;
  }
  const c = o.命令表[名];
  if (!c) {
    出.error(`没有 ${名} 这个命令`);
    出.log(帮助文本(o.命令表));
    return 1;
  }
  const 记录 = (o.新记录 ?? ((n, a) => new 运行记录(n, a)))(名, args);
  let code = 1;
  try {
    code = (await c.跑(args, 记录)) ?? 0;
  } catch (e) {
    const 栈 = e instanceof Error ? e.stack : undefined;
    const 信息 = e instanceof Error ? e.message : String(e);
    if (e instanceof 选作品错误) {
      出.error(信息);
      code = 2;
    } else if (e instanceof 用法错误) {
      出.error(`${信息}\n用法：anim ${c.用法}`);
      code = 2;
    } else {
      出.error(调试 || !是预期错误(e) ? (栈 ?? 信息) : `✗ ${信息}`);
      code = 1;
    }
    if (调试 && 栈 && (e instanceof 选作品错误 || e instanceof 用法错误)) 出.error(栈);
    // 上面已打过，不经 记录.记 再打一遍；调用栈总记下
    记录.事件.push({ 时间: utc时间(), 级别: '错误', 文本: 信息, ...(栈 ? { 调用栈: 栈 } : {}) });
  }
  if (!c.不记录) 记录.结束(code);
  return code;
};
