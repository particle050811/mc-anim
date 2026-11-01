import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { 读内存, 读压力 } from '../环境/资源.ts';
import { 找孤儿, 读进程 } from './孤儿.ts';
export type 机器快照 = {
    负载: number;
    核: number;
    闸: number | null;
    压力: number | null;
    free: number | null;
    压缩: number | null;
    swap: number | null;
    换出: number | null;
    GPU: number | null;
    热: number | null;
    盘: number | null;
    孤儿: number;
    进程: string;
};
const 跑 = (cmd: string, args: string[]) => { try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 * 1024 * 1024 });
}
catch {
    return '';
} };
export const 读机器快照 = (): 机器快照 => {
    const m = 读内存(), 进程 = 读进程(), mac = process.platform === 'darwin', vm = mac ? 跑('vm_stat', []) : '';
    const page = Number(/page size of (\d+)/.exec(vm)?.[1] ?? 4096);
    const 页 = (re: RegExp) => { const n = re.exec(vm)?.[1]; return n ? Number(n) * page : null; };
    const io = mac ? 跑('ioreg', ['-r', '-c', 'AGXAccelerator', '-l']) : '';
    let 盘: number | null = null;
    try {
        const st = fs.statfsSync(process.cwd());
        盘 = st.bavail * st.bsize;
    }
    catch { /* 平台不可读 */ }
    const 数 = (x: string | undefined) => x === undefined ? null : Number(x);
    return { 负载: os.loadavg()[0]!, 核: os.availableParallelism(), 闸: m?.空闲百分比 ?? null, 压力: 读压力(), free: mac ? 页(/Pages free:\s+(\d+)/) : os.freemem(), 压缩: 页(/Pages occupied by compressor:\s+(\d+)/), swap: m?.交换区已用 ?? null, 换出: 页(/Swapouts:\s+(\d+)/),
        GPU: 数(/"Device Utilization %"\s*=\s*(\d+)/.exec(io)?.[1]), 热: mac ? 数(跑('notifyutil', ['-g', 'com.apple.system.thermalpressure']).match(/(\d+)\s*$/)?.[1]) : null, 盘, 孤儿: 找孤儿(进程).length, 进程 };
};
