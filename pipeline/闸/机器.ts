import fs from 'node:fs';
import os from 'node:os';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { 读内存, 读压力, 解析vm_stat, 解析交换区, 一分钟负载 } from '../环境/资源.ts';
import { 读温度, 读温度并行, 无温度, type 温度读数 } from '../环境/温度.ts';
import { 找孤儿, 读进程 } from './孤儿.ts';
export type 机器快照 = {
    负载: number | null;
    核: number;
    闸: number | null;
    压力: number | null;
    free: number | null;
    压缩: number | null;
    swap: number | null;
    换出: number | null;
    GPU: number | null;
    /** 旧快照没有温度字段；热保留为发热等级的兼容别名，旧日志的热不追补。 */
    芯片最高温?: number | null;
    发热等级?: number | null;
    热: number | null;
    盘: number | null;
    孤儿: number | null;
    进程: string;
};
const 跑 = (cmd: string, args: string[]) => { try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 * 1024 * 1024 });
}
catch {
    return '';
} };
const 组快照 = (vm: string, 进程: string, io: string, 温度: 温度读数, 闸: number | null, swap: number | null, 压力: number | null): 机器快照 => {
    const page = Number(/page size of (\d+)/.exec(vm)?.[1] ?? 4096);
    const 页 = (re: RegExp) => { const n = re.exec(vm)?.[1]; return n ? Number(n) * page : null; };
    let 盘: number | null = null;
    try {
        const st = fs.statfsSync(process.cwd());
        盘 = st.bavail * st.bsize;
    }
    catch { /* 平台不可读 */ }
    const 数 = (x: string | undefined) => x === undefined ? null : Number(x);
    return { 负载: 一分钟负载(), 核: os.availableParallelism(), 闸, 压力, free: process.platform === 'darwin' ? 页(/Pages free:\s+(\d+)/) : os.freemem(), 压缩: 页(/Pages occupied by compressor:\s+(\d+)/), swap, 换出: 页(/Swapouts:\s+(\d+)/),
        GPU: 数(/"Device Utilization %"\s*=\s*(\d+)/.exec(io)?.[1]), ...温度, 热: 温度.发热等级, 盘, 孤儿: 进程 ? 找孤儿(进程).length : null, 进程 };
};
export const 读机器快照 = (读热 = 读温度): 机器快照 => {
    let 温度 = 无温度();
    try { 温度 = 读热(); } catch { /* 温度观测不能影响调度 */ }
    const m = 读内存(), 进程 = 读进程(), mac = process.platform === 'darwin';
    return 组快照(mac ? 跑('vm_stat', []) : '', 进程, mac ? 跑('ioreg', ['-r', '-c', 'AGXAccelerator', '-l']) : '', 温度, m?.空闲百分比 ?? null, m?.交换区已用 ?? null, 读压力());
};
const 执行 = promisify(execFile);
const 异步跑 = async (cmd: string, args: string[]): Promise<string> => {
    try { return (await 执行(cmd, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })).stdout; }
    catch { return ''; }
};
/** 快路径不串行等待只读进程；内存仍用资源闸同一解析器，不引入缓存读数。 */
export const 读机器快照并行 = async (执行命令 = 异步跑, 读热 = 读温度并行): Promise<机器快照> => {
    if (process.platform !== 'darwin') return 读机器快照();
    const [vm, sw, pressure, ps, io, heat] = await Promise.all([
        执行命令('vm_stat', []), 执行命令('sysctl', ['-n', 'vm.swapusage']),
        执行命令('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level']),
        执行命令('ps', ['-A', '-o', 'pid=,ppid=,rss=,command=']),
        执行命令('ioreg', ['-r', '-c', 'AGXAccelerator', '-l']),
        Promise.resolve().then(读热).catch(无温度),
    ]);
    const n = Number(pressure.trim());
    return 组快照(vm!, ps!, io!, heat!, vm ? Math.round(解析vm_stat(vm, os.totalmem()) / os.totalmem() * 100) : null, sw ? 解析交换区(sw).已用 : null, [1, 2, 4].includes(n) ? n : null);
};
