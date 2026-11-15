import fs from 'node:fs';
import os from 'node:os';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readMemory, readPressure, parseVmStat, parseSwap, load1Min } from '../环境/资源.ts';
import { readTemperature, readTempParallel, noTempReading, type TempReading } from '../环境/温度.ts';
import { findOrphans, 读进程 } from './孤儿.ts';
export type MachineSnapshot = {
    负载: number | null;
    核: number;
    闸: number | null;
    压力: number | null;
    free: number | null;
    压缩: number | null;
    swap: number | null;
    swapOut: number | null;
    GPU: number | null;
    /** 旧快照没有温度字段；热保留为发热等级的兼容别名，旧日志的热不追补。 */
    芯片最高温?: number | null;
    发热等级?: number | null;
    热: number | null;
    disk: number | null;
    orphans: number | null;
    psOutput: string;
};
const execSafe = (cmd: string, args: string[]) => { try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 * 1024 * 1024 });
}
catch {
    return '';
} };
const buildSnapshot = (vm: string, psOutput: string, io: string, temperature: TempReading, gate: number | null, swap: number | null, pressure: number | null): MachineSnapshot => {
    const page = Number(/page size of (\d+)/.exec(vm)?.[1] ?? 4096);
    const vmPagesBytes = (re: RegExp) => { const n = re.exec(vm)?.[1]; return n ? Number(n) * page : null; };
    let disk: number | null = null;
    try {
        const st = fs.statfsSync(process.cwd());
        disk = st.bavail * st.bsize;
    }
    catch { /* 平台不可读 */ }
    const numOrNull = (x: string | undefined) => x === undefined ? null : Number(x);
    return { 负载: load1Min(), 核: os.availableParallelism(), 闸: gate, 压力: pressure, free: process.platform === 'darwin' ? vmPagesBytes(/Pages free:\s+(\d+)/) : os.freemem(), 压缩: vmPagesBytes(/Pages occupied by compressor:\s+(\d+)/), swap, swapOut: vmPagesBytes(/Swapouts:\s+(\d+)/),
        GPU: numOrNull(/"Device Utilization %"\s*=\s*(\d+)/.exec(io)?.[1]), ...temperature, 热: temperature.发热等级, disk, orphans: psOutput ? findOrphans(psOutput).length : null, psOutput };
};
export const readMachineSnapshot = (readThermal = readTemperature): MachineSnapshot => {
    let temperature = noTempReading();
    try { temperature = readThermal(); } catch { /* 温度观测不能影响调度 */ }
    const m = readMemory(), psOutput = 读进程(), mac = process.platform === 'darwin';
    return buildSnapshot(mac ? execSafe('vm_stat', []) : '', psOutput, mac ? execSafe('ioreg', ['-r', '-c', 'AGXAccelerator', '-l']) : '', temperature, m?.freePercent ?? null, m?.swapUsed ?? null, readPressure());
};
const execFileAsync = promisify(execFile);
const runAsync = async (cmd: string, args: string[]): Promise<string> => {
    try { return (await execFileAsync(cmd, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })).stdout; }
    catch { return ''; }
};
/** 快路径不串行等待只读进程；内存仍用资源闸同一解析器，不引入缓存读数。 */
export const readMachineSnapshotParallel = async (runCommand = runAsync, readThermal = readTempParallel): Promise<MachineSnapshot> => {
    if (process.platform !== 'darwin') return readMachineSnapshot();
    const [vm, sw, pressure, ps, io, heat] = await Promise.all([
        runCommand('vm_stat', []), runCommand('sysctl', ['-n', 'vm.swapusage']),
        runCommand('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level']),
        runCommand('ps', ['-A', '-o', 'pid=,ppid=,rss=,command=']),
        runCommand('ioreg', ['-r', '-c', 'AGXAccelerator', '-l']),
        Promise.resolve().then(readThermal).catch(noTempReading),
    ]);
    const n = Number(pressure.trim());
    return buildSnapshot(vm!, ps!, io!, heat!, vm ? Math.round(parseVmStat(vm, os.totalmem()) / os.totalmem() * 100) : null, sw ? parseSwap(sw).used : null, [1, 2, 4].includes(n) ? n : null);
};
