// 运行记录和耗时表：每条 anim 命令结束时写一份 run/运行记录/<UTC>-<命令>-<pid>.json（参数、提交、事件、退出码），
// 并往 run/logs/耗时.tsv 追加一行；渲染等长任务另按段追加，开跑前用它报预计耗时（用户要求长任务先报预计耗时）。
// still、render 的分阶段耗时另记（阶段.ts）。
import fs from 'node:fs';
import path from 'node:path';
import { 耗时表, 运行记录目录, 配置 } from '../环境/配置.ts';
import { 提交状态 } from '../环境/路径.ts';
import type { 阶段记录 } from './阶段.ts';

const 表头 = '开始（UTC）\t标签\t秒\t退出码\t主机\t命令\n';

/** 2026-10-21T09:25:03Z 形式 */
export const utc时间 = (ms = Date.now()) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');

/** 月日-时分（UTC），预览和交付目录名用 */
export const utc月日时分 = (ms = Date.now()) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
};

const 单行 = (s: string) => s.replace(/[\t\r\n]+/g, ' ');

export const 记耗时 = (标签: string, 开始ms: number, 秒: number, 退出码: number, 命令: string, 表 = 耗时表()) => {
  fs.mkdirSync(path.dirname(表), { recursive: true });
  const 行 = `${utc时间(开始ms)}\t${单行(标签)}\t${秒.toFixed(1)}\t${退出码}\t${单行(配置('主机'))}\t${单行(命令)}\n`;
  if (!fs.existsSync(表)) fs.writeFileSync(表, 表头 + 行, 'utf8');
  else fs.appendFileSync(表, 行, 'utf8');
};

/** 同一标签最近 5 次成功的中位数（秒）；没有记录返回 null */
export const 预计耗时 = (标签: string, 表 = 耗时表()): number | null => {
  let text: string;
  try {
    text = fs.readFileSync(表, 'utf8');
  } catch {
    return null;
  }
  const 秒 = text
    .split('\n')
    .slice(1)
    .map((l) => l.split('\t'))
    .filter((c) => c[1] === 标签 && c[3] === '0')
    .map((c) => Number(c[2]))
    .slice(-5)
    .sort((a, b) => a - b);
  return 秒.length ? 秒[Math.floor(秒.length / 2)]! : null;
};

export type 事件 = { 时间: string; 级别: '信息' | '警告' | '错误'; 文本: string };

export class 运行记录 {
  命令: string;
  参数: string[];
  开始ms = Date.now();
  事件: 事件[] = [];
  产物: string[] = [];
  /** still、render 的分阶段耗时（阶段.ts）；没有就不写进记录 */
  阶段: 阶段记录[] = [];

  constructor(命令: string, 参数: string[]) {
    this.命令 = 命令;
    this.参数 = 参数;
  }

  记(级别: 事件['级别'], 文本: string) {
    this.事件.push({ 时间: utc时间(), 级别, 文本 });
    if (级别 !== '信息') console.error(`${级别 === '警告' ? '!!' : '✗'} ${文本}`);
  }

  结束(退出码: number) {
    const 秒 = (Date.now() - this.开始ms) / 1000;
    const 命令行 = ['anim', this.命令, ...this.参数].join(' ');
    try {
      记耗时(`anim ${this.命令}`, this.开始ms, 秒, 退出码, 命令行);
      const dir = 运行记录目录();
      fs.mkdirSync(dir, { recursive: true });
      const 名 = `${utc时间(this.开始ms).replace(/[-:]/g, '').replace('T', '-').replace('Z', '')}-${this.命令}-${process.pid}.json`;
      const 记录 = {
        命令: 命令行,
        开始: utc时间(this.开始ms),
        秒: Number(秒.toFixed(1)),
        退出码,
        主机: 配置('主机'),
        平台: `${process.platform}-${process.arch}`,
        node: process.version,
        代码: 提交状态(),
        工作目录: process.cwd(),
        事件: this.事件,
        产物: this.产物,
        ...(this.阶段.length ? { 阶段: this.阶段 } : {}),
      };
      fs.writeFileSync(path.join(dir, 名), JSON.stringify(记录, null, 2) + '\n', 'utf8');
    } catch (e) {
      console.error(`!! 运行记录没写成：${(e as Error).message}`);
    }
  }
}
