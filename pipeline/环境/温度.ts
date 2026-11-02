import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { 数据路径 } from './配置.ts';
import { 代码根 } from './路径.ts';

export type 温度读数 = { 芯片最高温: number | null; 发热等级: number | null };
export const 无温度 = (): 温度读数 => ({ 芯片最高温: null, 发热等级: null });
const 热键 = 'com.apple.system.thermalpressurelevel';
let 工具: string | null | undefined;

/** 编译失败只在本进程试一次，免得每次心跳都启动编译器；下次命令仍可重试。 */
const 温度工具 = (): string | null => {
  if (工具 !== undefined) return 工具;
  let 临时: string | undefined;
  try {
    const 源 = path.join(代码根(), 'pipeline', '环境', '温度.swift');
    const sha = createHash('sha256').update(fs.readFileSync(源)).digest('hex');
    const 文件 = 数据路径('cache', 'temperature', `die-${process.arch}-${sha}`);
    if (!fs.existsSync(文件)) {
      fs.mkdirSync(path.dirname(文件), { recursive: true });
      // 同时首次使用的进程各编自己的临时文件，发布前看不到半个可执行文件。
      临时 = `${文件}-${process.pid}-${randomUUID()}.tmp`;
      execFileSync('swiftc', ['-O', 源, '-o', 临时], { timeout: 20_000, stdio: 'ignore' });
      fs.renameSync(临时, 文件);
    }
    return (工具 = 文件);
  } catch {
    return (工具 = null);
  } finally {
    if (临时) { try { fs.rmSync(临时, { force: true }); } catch { /* 观测不能挡住调度 */ } }
  }
};

const 组读数 = (芯温: string, 热: string): 温度读数 => {
  const t = Number(芯温.trim()), level = /(?:^|\s)([0-4])\s*$/.exec(热);
  return { 芯片最高温: Number.isFinite(t) && t > 0 && t < 150 ? Number(t.toFixed(1)) : null, 发热等级: level ? Number(level[1]) : null };
};
const 跑 = (cmd: string, args: string[]): string => {
  try { return execFileSync(cmd, args, { encoding: 'utf8', timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return ''; }
};
const 异步跑 = (cmd: string, args: string[]): Promise<string> => new Promise(resolve => {
  try { execFile(cmd, args, { encoding: 'utf8', timeout: 1000 }, (err, out) => resolve(err ? '' : out)); }
  catch { resolve(''); }
});

/** 两项独立退化：缺 Swift 或芯片传感器仍可读发热等级；非 Mac 不启动探针。 */
export const 读温度 = (): 温度读数 => {
  if (process.platform !== 'darwin') return 无温度();
  const 文件 = 温度工具();
  return 组读数(文件 ? 跑(文件, []) : '', 跑('notifyutil', ['-g', 热键]));
};
export const 读温度并行 = async (): Promise<温度读数> => {
  if (process.platform !== 'darwin') return 无温度();
  const 文件 = 温度工具();
  const [芯温, 热] = await Promise.all([文件 ? 异步跑(文件, []) : '', 异步跑('notifyutil', ['-g', 热键])]);
  return 组读数(芯温, 热);
};
