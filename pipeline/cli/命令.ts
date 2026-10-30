import type { 运行记录 } from '../运行记录/记录.ts';

export type 命令 = {
  用法: string;
  说明: string;
  跑: (args: string[], 记录: 运行记录) => Promise<number | void>;
  /** anim env 这类只读、瞬间完成的命令不写运行记录 */
  不记录?: boolean;
  /** 参数原样转给别的程序（mcai、remotion studio）：--help 归那边答，路由不拦 */
  透传?: boolean;
  /** anim <命令> --help、anim help <命令> 打的详细帮助；没有就打 用法 和 说明 */
  帮助?: () => string;
};
