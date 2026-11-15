// 运行记录和耗时表：每条 anim 命令结束时写一份 run/运行记录/<UTC>-<命令>-<pid>.json（参数、提交、事件、退出码），
// 并往 run/logs/耗时.tsv 追加一行；渲染等长任务另按段追加，开跑前用它报预计耗时（用户要求长任务先报预计耗时）。
// still、film 渲段的分阶段耗时另记（阶段.ts）。
import fs from 'node:fs';
import path from 'node:path';
import { timingLogPath, runLogDir, config } from '../环境/配置.ts';
import { commitStatus } from '../环境/路径.ts';
import { maskCommand } from '../闸/发起者.ts';
import type { StageRecord } from './阶段.ts';

const headerLine = '开始（UTC）\t标签\t秒\t退出码\t主机\t命令\n';

/** 2026-10-21T09:25:03Z 形式 */
export const utcTime = (ms = Date.now()) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');

/** 月日-时分（UTC），预览和交付目录名用 */
export const utcMonthDayTime = (ms = Date.now()) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
};

const oneLine = (s: string) => s.replace(/[\t\r\n]+/g, ' ');

export const recordTiming = (label: string, startMs: number, elapsedSec: number, exitCode: number, command: string, timingFile = timingLogPath()) => {
  fs.mkdirSync(path.dirname(timingFile), { recursive: true });
  const line = `${utcTime(startMs)}\t${oneLine(label)}\t${elapsedSec.toFixed(1)}\t${exitCode}\t${oneLine(config('主机'))}\t${oneLine(command)}\n`;
  if (!fs.existsSync(timingFile)) fs.writeFileSync(timingFile, headerLine + line, 'utf8');
  else fs.appendFileSync(timingFile, line, 'utf8');
};

/** 同一标签最近 5 次成功的中位数（秒）；没有记录返回 null */
export const estimateTiming = (label: string, timingFile = timingLogPath()): number | null => {
  let text: string;
  try {
    text = fs.readFileSync(timingFile, 'utf8');
  } catch {
    return null;
  }
  const secLines = text
    .split('\n')
    .slice(1)
    .map((l) => l.split('\t'))
    .filter((c) => c[1] === label && c[3] === '0')
    .map((c) => Number(c[2]))
    .slice(-5)
    .sort((a, b) => a - b);
  return secLines.length ? secLines[Math.floor(secLines.length / 2)]! : null;
};

export type RunEvent = { 时间: string; 级别: '信息' | '警告' | '错误'; 文本: string; /** 命令抛出的错（cli/路由.ts）：屏幕上不一定打，这里总记 */ 调用栈?: string };

export class RunRecord {
  任务?: string;
  private ended = false;
  命令: string;
  参数: string[];
  startMs = Date.now();
  事件: RunEvent[] = [];
  产物: string[] = [];
  /** still、film 渲段的分阶段耗时（阶段.ts）；没有就不写进记录 */
  阶段: StageRecord[] = [];

  constructor(command: string, params: string[]) {
    this.命令 = command;
    this.参数 = params;
  }

  log(level: RunEvent['级别'], messageText: string) {
    this.事件.push({ 时间: utcTime(), 级别: level, 文本: messageText });
    if (level !== '信息') console.error(`${level === '警告' ? '!!' : '✗'} ${messageText}`);
  }

  结束(exitCode: number) {
    if(this.ended)return;this.ended=true;
    const elapsedSec = (Date.now() - this.startMs) / 1000;
    const commandLine = maskCommand(['anim', this.命令, ...this.参数]);
    try {
      recordTiming(`anim ${this.命令}`, this.startMs, elapsedSec, exitCode, commandLine);
      const dir = runLogDir();
      fs.mkdirSync(dir, { recursive: true });
      const fileName = `${utcTime(this.startMs).replace(/[-:]/g, '').replace('T', '-').replace('Z', '')}-${this.命令}-${process.pid}.json`;
      const runRecord = {
        任务: this.任务,
        命令: commandLine,
        开始: utcTime(this.startMs),
        秒: Number(elapsedSec.toFixed(1)),
        退出码: exitCode,
        主机: config('主机'),
        平台: `${process.platform}-${process.arch}`,
        node: process.version,
        代码: commitStatus(),
        工作目录: process.cwd(),
        事件: this.事件,
        产物: this.产物,
        ...(this.阶段.length ? { 阶段: this.阶段 } : {}),
      };
      fs.writeFileSync(path.join(dir, fileName), JSON.stringify(runRecord, null, 2) + '\n', 'utf8');
    } catch (e) {
      console.error(`!! 运行记录没写成：${(e as Error).message}`);
    }
  }
}
