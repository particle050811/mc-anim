import type { 运行记录 } from '../运行记录/记录.ts';

export type 命令 = {
  用法: string;
  说明: string;
  跑: (args: string[], 记录: 运行记录) => Promise<number | void>;
  /** anim env 这类只读、瞬间完成的命令不写运行记录 */
  不记录?: boolean;
};
