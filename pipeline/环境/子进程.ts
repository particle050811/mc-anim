// 起子进程的唯一入口：一律数组参数、不开 shell；Windows 上 .cmd、PATHEXT 交给 cross-spawn。文本输出固定 UTF-8。
import spawn from 'cross-spawn';
import type { SpawnOptions } from 'node:child_process';
import { isWindows } from './配置.ts';

export class 子进程失败 extends Error {
  退出码: number | null;
  constructor(cmd: readonly string[], code: number | null, stderr: string) {
    const tail = stderr.trim().split('\n').slice(-15).join('\n');
    super(`命令失败（退出码 ${code}）：${cmd.join(' ')}${tail ? '\n' + tail : ''}`);
    this.退出码 = code;
  }
}

/** 降 CPU 优先级（nice 10）跑：渲染、编码占满核时前台不卡。Windows 没有 nice，不降 */
export const 低优先级 = (cmd: readonly string[]): string[] => (isWindows ? [...cmd] : ['nice', '-n', '10', ...cmd]);

/** 跑完，返回 stdout（UTF-8 文本）；退出码非 0 抛 子进程失败（带 stderr 末尾） */
export const 跑出 = (cmd: readonly string[], opts: SpawnOptions = {}): string => {
  const r = spawn.sync(cmd[0]!, cmd.slice(1), { ...opts, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 30 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new 子进程失败(cmd, r.status, String(r.stderr ?? ''));
  return String(r.stdout ?? '');
};

/** 跑完，返回 { 退出码, stdout, stderr }，不抛 */
export const 试跑 = (cmd: readonly string[], opts: SpawnOptions = {}) => {
  const r = spawn.sync(cmd[0]!, cmd.slice(1), { ...opts, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 30 });
  return { 退出码: r.error ? null : r.status, stdout: String(r.stdout ?? ''), stderr: r.error ? String(r.error.message) : String(r.stderr ?? '') };
};

/** 异步跑；输出继承到终端（ffmpeg 进度、报错直接给人看），stderr 另收一份放进报错 */
export const 跑 = (cmd: readonly string[], opts: SpawnOptions & { 安静?: boolean } = {}): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd[0]!, cmd.slice(1), { ...opts, stdio: ['ignore', opts.安静 ? 'ignore' : 'inherit', 'pipe'] });
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (d: string) => {
      stderr += d;
      if (stderr.length > 1 << 20) stderr = stderr.slice(-(1 << 19));
      if (!opts.安静) process.stderr.write(d);
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new 子进程失败(cmd, code, stderr))));
  });
