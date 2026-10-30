// 把 argv 拼成能照抄进终端的一行，只给人看（--只打印、报错里的命令）；真跑一律数组参数、不经 shell（子进程.ts）。
// POSIX 用单引号；Windows 照 cmd 和 CommandLineToArgvW 的规矩用双引号（PowerShell 也认）。
// 坑：cmd 里双引号挡不住 %变量%，PowerShell 里挡不住 $ 和 `；路径里很少有，不另处理。
import { isWindows } from './配置.ts';

export type 壳 = 'posix' | 'windows';
export const 本机壳 = (): 壳 => (isWindows ? 'windows' : 'posix');

const 引posix = (a: string) => (!a || /[\s'"$`\\|&;<>()*?[\]{}!#~]/.test(a) ? `'${a.replaceAll("'", `'\\''`)}'` : a);

/** Windows 程序自己拆命令行（CommandLineToArgvW）：引号前的反斜杠成对、引号前加反斜杠；末尾的反斜杠也要成对，免得吃掉收尾的引号。通配符不用引：cmd 不展开 */
const 引windows = (a: string) => {
  if (a && !/[\s"&|<>^()]/.test(a)) return a;
  const 里 = a.replace(/(\\*)"/g, (_, 斜: string) => `${斜}${斜}\\"`).replace(/(\\+)$/, '$1$1');
  return `"${里}"`;
};

export const 引参数 = (a: string, 用: 壳 = 本机壳()) => (用 === 'windows' ? 引windows(a) : 引posix(a));

export const 命令行文本 = (argv: readonly string[], 用: 壳 = 本机壳()) => argv.map((a) => 引参数(a, 用)).join(' ');
