// 起子进程的唯一入口：一律数组参数、不开 shell；Windows 上 .cmd、PATHEXT 交给 cross-spawn。文本输出固定 UTF-8。
import spawn from 'cross-spawn';
import {registerCleanup} from './收尾.ts';
import type { SpawnOptions } from 'node:child_process';
import { isMac, isWindows } from './配置.ts';

export class SubprocessError extends Error {
  exitCode: number | null;
  constructor(cmd: readonly string[], code: number | null, stderr: string) {
    const tail = stderr.trim().split('\n').slice(-15).join('\n');
    super(`命令失败（退出码 ${code}）：${cmd.join(' ')}${tail ? '\n' + tail : ''}`);
    this.exitCode = code;
  }
}

/** 降 CPU 优先级（nice 10）跑：渲染、编码占满核时前台不卡。Windows 没有 nice，不降 */
export const lowPriority = (cmd: readonly string[]): string[] => (isWindows ? [...cmd] : ['nice', '-n', '10', ...cmd]);

/** 跑完，返回 stdout（UTF-8 文本）；退出码非 0 抛 子进程失败（带 stderr 末尾） */
export const runCapture = (cmd: readonly string[], opts: SpawnOptions = {}): string => {
  const r = spawn.sync(cmd[0]!, cmd.slice(1), { ...opts, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 30 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new SubprocessError(cmd, r.status, String(r.stderr ?? ''));
  return String(r.stdout ?? '');
};

/** 跑完，返回 stdout 原始字节（ffmpeg 出 PCM、raw 帧用）；退出码非 0 抛 子进程失败。给了 输入 就从 stdin 喂进去（PNG 交给 ffmpeg 转 yuv） */
export const runCaptureBytes = (cmd: readonly string[], opts: SpawnOptions & { input?: Buffer } = {}): Buffer => {
  const { input: stdin, ...rest } = opts;
  const r = spawn.sync(cmd[0]!, cmd.slice(1), { ...rest, ...(stdin ? { input: stdin } : {}), stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'], maxBuffer: 2 ** 32 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new SubprocessError(cmd, r.status, String(r.stderr ?? ''));
  return r.stdout as Buffer;
};

/** 跑完，返回 { 退出码, stdout, stderr }，不抛 */
export const tryRun = (cmd: readonly string[], opts: SpawnOptions = {}) => {
  const r = spawn.sync(cmd[0]!, cmd.slice(1), { ...opts, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 30 });
  return { exitCode: r.error ? null : r.status, stdout: String(r.stdout ?? ''), stderr: r.error ? String(r.error.message) : String(r.stderr ?? '') };
};

/** 异步跑；输出继承到终端（ffmpeg 进度、报错直接给人看），stderr 另收一份放进报错 */
export const runCmd = (cmd: readonly string[], opts: SpawnOptions & { quiet?: boolean } = {}): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd[0]!, cmd.slice(1), { ...opts, stdio: ['ignore', opts.quiet ? 'ignore' : 'inherit', 'pipe'] });
    // 调度取消直接退出，不会等 finally；一并停止本次启动的叶子进程，避免转码继续占资源。
    const undo=registerCleanup(()=>{child.kill('SIGTERM');});
    child.once('close',undo);
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (d: string) => {
      stderr += d;
      if (stderr.length > 1 << 20) stderr = stderr.slice(-(1 << 19));
      if (!opts.quiet) process.stderr.write(d);
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new SubprocessError(cmd, code, stderr))));
  });

/** 前台交互跑（stdin、stdout、stderr 都接终端），等它退出，返回退出码 */
export const runForeground = (cmd: readonly string[], opts: SpawnOptions = {}): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd[0]!, cmd.slice(1), { ...opts, stdio: 'inherit' });
    const undo=registerCleanup(()=>{child.kill('SIGTERM');});
    child.once('close',undo);
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });

/** 异步跑；stdout 边转给终端边收一份（要从别的 anim 的输出里取它写到哪了），stderr 直接接终端；返回退出码和 stdout */
export const runTee = (cmd: readonly string[], opts: SpawnOptions = {}): Promise<{ exitCode: number; stdout: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd[0]!, cmd.slice(1), { ...opts, stdio: ['ignore', 'pipe', 'inherit'] });
    const undo = registerCleanup(() => { child.kill('SIGTERM'); });
    child.once('close', undo);
    let stdout = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (d: string) => {
      stdout = (stdout + d).slice(-(1 << 20));
      process.stdout.write(d);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout }));
  });

// Windows：系统用了 Modern Standby 时，闲置关屏就进待机（11-14 笔记本接着电源、「睡眠」设成从不，关屏 30 分钟一到照样进 S0 待机），长渲染不能让它睡。
// 同一天笔记本渲穿塔约第 2400 帧丢 WebGL 上下文，当时归到待机，后来查明是显存越攒越多（engine/voxel/容器池.ts），不是这里。
const antiSleepScript = (pid: number) =>
  [
    `Add-Type -Name P -Namespace W -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'`,
    // ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED（0x80000003），进程退出就自动撤销。
    // 写十进制：PowerShell 5.1 把 0x80000003 读成负的 Int32，转 uint 报错。ssh 进来的会话 0 没有显示器，只挂得上 SYSTEM
    `[void][W.P]::SetThreadExecutionState(2147483651)`,
    `Wait-Process -Id ${pid} -ErrorAction SilentlyContinue`,
  ].join('; ');

/** 本进程活着时不让电脑闲置睡眠（Mac caffeinate -i，Windows SetThreadExecutionState），返回撤销函数；起不来就照常跑 */
export const keepAwake = (pid = process.pid): (() => void) => {
  const cmd = isMac
    ? ['caffeinate', '-i', '-w', String(pid)]
    : isWindows
      ? ['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(antiSleepScript(pid), 'utf16le').toString('base64')]
      : null;
  if (!cmd) return () => {};
  const child = spawn(cmd[0]!, cmd.slice(1), { stdio: 'ignore', windowsHide: true });
  child.on('error', () => {});
  child.unref();
  return () => {
    child.kill();
  };
};
