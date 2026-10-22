// 本机资源读数（资源闸、anim doctor 用）。
// Mac 不用 memory_pressure：它把可压缩的页也算空闲，交换区快满时还报近一半空闲（全局记忆 resource-concurrency-preference，10-06）。
// 这里按 vm_stat 的 free + inactive + speculative + purgeable 算空闲，另读交换区；交换区剩不到一成也当内存不够。
// Windows 读 Win32_OperatingSystem（未在 Windows 实测），Linux 读 /proc/meminfo 的 MemAvailable。
import fs from 'node:fs';
import os from 'node:os';
import { isMac, isWindows } from './配置.ts';
import { 试跑 } from './子进程.ts';

export type 内存读数 = { 总: number; 空闲: number; 空闲百分比: number; 交换区总: number; 交换区已用: number };

export const 解析vm_stat = (text: string, 总字节: number) => {
  const page = Number(/page size of (\d+) bytes/.exec(text)?.[1] ?? 4096);
  const 页 = (名: string) => Number(new RegExp(`Pages ${名}:\\s+(\\d+)`).exec(text)?.[1] ?? 0);
  const 空闲 = (页('free') + 页('inactive') + 页('speculative') + 页('purgeable')) * page;
  return Math.min(空闲, 总字节);
};

/** sysctl vm.swapusage：total = 8192.00M  used = 6935.00M ... */
export const 解析交换区 = (text: string) => {
  const mb = (名: string) => Number(new RegExp(`${名} = ([\\d.]+)M`).exec(text)?.[1] ?? 0) * 1024 * 1024;
  return { 总: mb('total'), 已用: mb('used') };
};

export const 读内存 = (): 内存读数 | null => {
  const 总 = os.totalmem();
  let 空闲: number;
  let 交换区 = { 总: 0, 已用: 0 };
  if (isMac) {
    const vm = 试跑(['vm_stat']);
    if (vm.退出码 !== 0) return null;
    空闲 = 解析vm_stat(vm.stdout, 总);
    const sw = 试跑(['sysctl', '-n', 'vm.swapusage']);
    if (sw.退出码 === 0) 交换区 = 解析交换区(sw.stdout);
  } else if (isWindows) {
    const r = 试跑(['powershell', '-NoProfile', '-Command', '$o = Get-CimInstance Win32_OperatingSystem; "$($o.FreePhysicalMemory) $($o.TotalVirtualMemorySize) $($o.FreeVirtualMemory) $($o.TotalVisibleMemorySize)"']);
    const [free, totalVirt, freeVirt, totalVisible] = r.stdout.trim().split(/\s+/).map(Number);
    if (r.退出码 !== 0 || !Number.isFinite(free)) return null;
    空闲 = free! * 1024;
    交换区 = { 总: Math.max(0, (totalVirt! - totalVisible!) * 1024), 已用: Math.max(0, (totalVirt! - freeVirt! - (totalVisible! - free!)) * 1024) };
  } else {
    try {
      const text = fs.readFileSync('/proc/meminfo', 'utf8');
      const kb = (名: string) => Number(new RegExp(`^${名}:\\s+(\\d+)`, 'm').exec(text)?.[1] ?? 0) * 1024;
      空闲 = kb('MemAvailable');
      交换区 = { 总: kb('SwapTotal'), 已用: kb('SwapTotal') - kb('SwapFree') };
    } catch {
      return null;
    }
  }
  return { 总, 空闲, 空闲百分比: Math.round((空闲 / 总) * 100), 交换区总: 交换区.总, 交换区已用: 交换区.已用 };
};

/** 渲染能不能放行：照旧资源闸只看空闲内存不低于下限。交换区只显示不卡（Mac 交换区用掉后很久不还，卡它会一直等） */
export const 内存够渲染 = (m: 内存读数, 下限百分比: number) => m.空闲百分比 >= 下限百分比;

export const 核数 = () => os.availableParallelism();

/** 1 分钟平均负载；Windows 没有，返回 null */
export const 一分钟负载 = (): number | null => (isWindows ? null : os.loadavg()[0]!);

export const 读数说明 = (m: 内存读数) =>
  `空闲内存 ${m.空闲百分比}%（${(m.空闲 / 2 ** 30).toFixed(1)}/${(m.总 / 2 ** 30).toFixed(0)} GB）` +
  (m.交换区总 ? `，交换区 ${(m.交换区已用 / 2 ** 30).toFixed(1)}/${(m.交换区总 / 2 ** 30).toFixed(1)} GB` : '');
