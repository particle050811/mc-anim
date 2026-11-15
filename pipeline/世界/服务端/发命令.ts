// 起好的服务端按顺序发命令：普通命令发出去等 3 秒；sleep:秒 只等；wait:话 一直等到日志出现；expect:话 30 秒内没出现就报错（调用方负责停服）。
import type { Server } from './服务端.ts';

export const sendCommandsInOrder = async (s: Server, commands: readonly string[], log: (s: string) => void = console.log) => {
  for (const c of commands) {
    if (c.startsWith('sleep:')) await new Promise((r) => setTimeout(r, Number(c.slice(6)) * 1000));
    else if (c.startsWith('wait:')) {
      if (!(await s.等(c.slice(5), Infinity))) throw s.error ?? new Error(`等到「${c.slice(5)}」之前服务端退出了`);
    } else if (c.startsWith('expect:')) {
      if (!(await s.等(c.slice(7), 30))) throw new Error(`上一条命令以后 30 秒内日志里没有「${c.slice(7)}」，停服（后面的命令不发）`);
    } else {
      log(`== > ${c}`);
      s.发(c);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
};
