// 把 argv 拼成能照抄进终端的一行，只给人看（--print-only、报错里的命令）；真跑一律数组参数、不经 shell（子进程.ts）。
// POSIX 用单引号；Windows 照 cmd 和 CommandLineToArgvW 的规矩用双引号（PowerShell 也认）。
// 坑：cmd 里双引号挡不住 %变量%，PowerShell 里挡不住 $ 和 `；路径里很少有，不另处理。
import { isWindows } from './配置.ts';

export type ShellKind = 'posix' | 'windows';
export const localShell = (): ShellKind => (isWindows ? 'windows' : 'posix');

const quotePosix = (a: string) => (!a || /[\s'"$`\\|&;<>()*?[\]{}!#~]/.test(a) ? `'${a.replaceAll("'", `'\\''`)}'` : a);

/** Windows 程序自己拆命令行（CommandLineToArgvW）：引号前的反斜杠成对、引号前加反斜杠；末尾的反斜杠也要成对，免得吃掉收尾的引号。通配符不用引：cmd 不展开 */
const quoteWindows = (a: string) => {
  if (a && !/[\s"&|<>^()]/.test(a)) return a;
  const inner = a.replace(/(\\*)"/g, (_, backslashes: string) => `${backslashes}${backslashes}\\"`).replace(/(\\+)$/, '$1$1');
  return `"${inner}"`;
};

export const quoteArg = (a: string, shell: ShellKind = localShell()) => (shell === 'windows' ? quoteWindows(a) : quotePosix(a));

export const commandLineText = (argv: readonly string[], shell: ShellKind = localShell()) => argv.map((a) => quoteArg(a, shell)).join(' ');
