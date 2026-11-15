import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { dataPath } from './配置.ts';
import { codeRoot } from './路径.ts';

export type TempReading = { 芯片最高温: number | null; 发热等级: number | null };
export const noTempReading = (): TempReading => ({ 芯片最高温: null, 发热等级: null });
const thermalKey = 'com.apple.system.thermalpressurelevel';
let tool: { 源: string; 文件: string } | null | undefined;
let triedCompile = false;
// Agent 选的初值：编译失败后冷却 1 小时，避免每条命令都启动 swiftc、最多阻塞 20 秒。
const failCooldownMs = 3600_000;

const thermalTool = (): string | null => {
  let tempPath: string | undefined;
  try {
    if (tool === undefined) {
      tool = null;
      const sourcePath = path.join(codeRoot(), 'pipeline', '环境', '温度.swift');
      const sha = createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
      tool = { 源: sourcePath, 文件: dataPath('cache', 'temperature', `die-${process.arch}-${sha}`) };
    }
    if (!tool) return null;
    const { 源: sourcePath, 文件: file } = tool;
    // 本进程失败后，其他进程仍可能编好；只抑制重复编译，不把缺读数记死。
    if (fs.existsSync(file)) return file;
    if (triedCompile) return null;
    const failedAt = fs.statSync(`${file}.失败`, { throwIfNoEntry: false })?.mtimeMs;
    if (failedAt !== undefined && Date.now() - failedAt < failCooldownMs) return null;
    triedCompile = true;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // 同时首次使用的进程各编自己的临时文件，发布前看不到半个可执行文件。
    tempPath = `${file}-${process.pid}-${randomUUID()}.tmp`;
    // SIGTERM 会留下 swift-frontend 孤儿，SIGINT 让 swiftc 驱动一并结束子进程。
    execFileSync('swiftc', ['-O', sourcePath, '-o', tempPath], { timeout: 20_000, killSignal: 'SIGINT', stdio: 'ignore' });
    fs.renameSync(tempPath, file);
    return file;
  } catch {
    if (tool && triedCompile) {
      try { fs.writeFileSync(`${tool.文件}.失败`, ''); } catch { /* 缓存不可写也不能挡住调度 */ }
    }
    return null;
  } finally {
    if (tempPath) { try { fs.rmSync(tempPath, { force: true }); } catch { /* 观测不能挡住调度 */ } }
  }
};

const combineReadings = (chipTempText: string, thermalText: string): TempReading => {
  const t = Number(chipTempText.trim()), level = /(?:^|\s)([0-4])\s*$/.exec(thermalText);
  return { 芯片最高温: Number.isFinite(t) && t > 0 && t < 150 ? Number(t.toFixed(1)) : null, 发热等级: level ? Number(level[1]) : null };
};
const execText = (cmd: string, args: string[]): string => {
  try { return execFileSync(cmd, args, { encoding: 'utf8', timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return ''; }
};
const runAsync = (cmd: string, args: string[]): Promise<string> => new Promise(resolve => {
  try { execFile(cmd, args, { encoding: 'utf8', timeout: 1000 }, (err, out) => resolve(err ? '' : out)); }
  catch { resolve(''); }
});

/** 两项独立退化：缺 Swift 或芯片传感器仍可读发热等级；非 Mac 不启动探针。 */
export const readTemperature = (): TempReading => {
  if (process.platform !== 'darwin') return noTempReading();
  const file = thermalTool();
  return combineReadings(file ? execText(file, []) : '', execText('notifyutil', ['-g', thermalKey]));
};
/** 出帧时采样用，不同步等探针子进程（探针还没编好的第一次会同步编一次 swiftc）。 */
export const readTempParallel = async (): Promise<TempReading> => {
  if (process.platform !== 'darwin') return noTempReading();
  const file = thermalTool();
  const [chipTempText, thermalText] = await Promise.all([file ? runAsync(file, []) : '', runAsync('notifyutil', ['-g', thermalKey])]);
  return combineReadings(chipTempText, thermalText);
};
