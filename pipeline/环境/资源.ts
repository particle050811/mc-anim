// 本机资源读数（资源闸、anim doctor 用）。
// Mac 不用 memory_pressure：它把可压缩的页也算空闲，交换区快满时还报近一半空闲（全局记忆 resource-concurrency-preference，10-06）。
// 这里按 vm_stat 的 free + inactive + speculative + purgeable 算空闲，另读交换区只供展示，不因已用交换区长期不归还而一直阻塞。
// Windows 读 Win32_OperatingSystem（未在 Windows 实测），Linux 读 /proc/meminfo 的 MemAvailable。
import fs from 'node:fs';
import os from 'node:os';
import { isMac, isWindows } from './配置.ts';
import { tryRun } from './子进程.ts';

export type MemReading = { 总: number; 空闲: number; 空闲百分比: number; 交换区总: number; 交换区已用: number | null };

export const parseVmStat = (text: string, totalBytes: number) => {
  const page = Number(/page size of (\d+) bytes/.exec(text)?.[1] ?? 4096);
  const pageCount = (pageKind: string) => Number(new RegExp(`Pages ${pageKind}:\\s+(\\d+)`).exec(text)?.[1] ?? 0);
  const free = (pageCount('free') + pageCount('inactive') + pageCount('speculative') + pageCount('purgeable')) * page;
  return Math.min(free, totalBytes);
};

/** sysctl vm.swapusage：total = 8192.00M  used = 6935.00M ... */
export const parseSwap = (text: string) => {
  const mb = (fieldName: string) => Number(new RegExp(`${fieldName} = ([\\d.]+)M`).exec(text)?.[1] ?? 0) * 1024 * 1024;
  return { 总: mb('total'), used: mb('used') };
};

export const readMemory = (): MemReading | null => {
  const total = os.totalmem();
  let freeBytes: number;
  let swap: { 总: number; used: number | null } = { 总: 0, used: null };
  if (isMac) {
    const vm = tryRun(['vm_stat']);
    if (vm.退出码 !== 0) return null;
    freeBytes = parseVmStat(vm.stdout, total);
    const sw = tryRun(['sysctl', '-n', 'vm.swapusage']);
    if (sw.退出码 === 0) swap = parseSwap(sw.stdout);
  } else if (isWindows) {
    const r = tryRun(['powershell', '-NoProfile', '-Command', '$o = Get-CimInstance Win32_OperatingSystem; "$($o.FreePhysicalMemory) $($o.TotalVirtualMemorySize) $($o.FreeVirtualMemory) $($o.TotalVisibleMemorySize)"']);
    const [free, totalVirt, freeVirt, totalVisible] = r.stdout.trim().split(/\s+/).map(Number);
    if (r.退出码 !== 0 || !Number.isFinite(free)) return null;
    freeBytes = free! * 1024;
    swap = { 总: Math.max(0, (totalVirt! - totalVisible!) * 1024), used: Math.max(0, (totalVirt! - freeVirt! - (totalVisible! - free!)) * 1024) };
  } else {
    try {
      const text = fs.readFileSync('/proc/meminfo', 'utf8');
      const kb = (fieldName: string) => Number(new RegExp(`^${fieldName}:\\s+(\\d+)`, 'm').exec(text)?.[1] ?? 0) * 1024;
      freeBytes = kb('MemAvailable');
      swap = { 总: kb('SwapTotal'), used: kb('SwapTotal') - kb('SwapFree') };
    } catch {
      return null;
    }
  }
  return { 总: total, 空闲: freeBytes, 空闲百分比: Math.round((freeBytes / total) * 100), 交换区总: swap.总, 交换区已用: swap.used };
};

/** 渲染能不能放行：照旧资源闸只看空闲内存不低于下限。交换区只显示不卡（Mac 交换区用掉后很久不还，卡它会一直等） */
export const enoughMemory = (m: MemReading, minPercent: number) => m.空闲百分比 >= minPercent;

export const coreCount = () => os.availableParallelism();

/** 1 分钟平均负载；Windows 没有，返回 null */
export const load1Min = (): number | null => (isWindows ? null : os.loadavg()[0]!);

export const readingNote = (m: MemReading) =>
  `空闲内存 ${m.空闲百分比}%（${(m.空闲 / 2 ** 30).toFixed(1)}/${(m.总 / 2 ** 30).toFixed(0)} GB）` +
  (m.交换区总 && m.交换区已用 !== null ? `，交换区 ${(m.交换区已用 / 2 ** 30).toFixed(1)}/${(m.交换区总 / 2 ** 30).toFixed(1)} GB` : '');

/** macOS 压力值：1 正常、2 警告、4 严重；不支持的平台不猜。 */
export const readPressure = (): number | null => {
  if (!isMac) return null;
  const r = tryRun(['sysctl', '-n', 'kern.memorystatus_vm_pressure_level']);
  const n = Number(r.stdout.trim());
  return r.退出码 === 0 && [1, 2, 4].includes(n) ? n : null;
};
