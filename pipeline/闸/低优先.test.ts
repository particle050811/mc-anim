import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { 取低优先参数 } from '../cli/路由.ts';
import { 读发起者 } from './发起者.ts';
import { 开闸批 } from './闸.ts';
import { 取调度环境 } from './任务.ts';
import { 列票, 领票, 回队尾, 是低优先票 } from './票.ts';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-低优先-'));
});
afterEach(() => {
  delete process.env.ANIM_PRIORITY;
  fs.rmSync(dir, { recursive: true, force: true });
});

const 任务 = (名: string, 低优先 = false) => ({ 任务: 名, 起: Date.now(), 心跳: Date.now(), 主机: os.hostname(), 发起: 读发起者({}, [], dir, false), 声明: { 种: 'render', ...(低优先 ? { 低优先: true } : {}) } });

it('低优先的票排在全部普通票后面（后领的普通票也在它前面），暂缓票之前；回队尾各回各档', () => {
  const 队 = path.join(dir, '渲染.排队');
  const 低 = 领票(队, os.hostname(), 任务('低', true), Date.now());
  const 普 = 领票(队, os.hostname(), 任务('普'), Date.now());
  expect(低.名.startsWith('8')).toBe(true);
  expect(是低优先票(低)).toBe(true);
  expect(是低优先票(普)).toBe(false);
  expect(列票(队).map((t) => t.内容?.任务)).toEqual(['普', '低']);
  const 低二 = 领票(队, os.hostname(), 任务('低二', true), Date.now());
  const 回 = 回队尾(低);
  expect(是低优先票(回)).toBe(true);
  expect(回.时间).toBeGreaterThan(低二.时间);
  const 普回 = 回队尾(普);
  expect(是低优先票(普回)).toBe(false);
  expect(列票(队).map((t) => t.内容?.任务)).toEqual(['普', '低二', '低']);
});

it('低优先的批：有普通票在等，项间马上让开（不等满 120 秒）；只有别的低优先票在等时照 120 秒的老规矩', async () => {
  let now = Date.now();
  const e = { ...取调度环境({ 锁目录: dir, 现在毫秒: () => now }), 读内存: () => null, 读压力: () => 1 };
  const 主机 = os.hostname().replace(/[^A-Za-z0-9._-]/g, '_');
  const 跑 = async (等的票名: string) => {
    process.env.ANIM_PRIORITY = 'low';
    const 批 = 开闸批({ 项数: 2 }, e);
    let 票 = '';
    await 批.一项({}, async () => {
      票 = JSON.parse(fs.readFileSync(path.join(dir, '渲染.lock.信息.json'), 'utf8')).票;
    });
    expect(票.startsWith('8')).toBe(true);
    const file = path.join(dir, '渲染.排队', 等的票名);
    fs.writeFileSync(file, String(process.ppid));
    await 批.一项({}, async () => {
      now += 10_000;
    });
    const 还拿着 = fs.existsSync(path.join(dir, '渲染.lock'));
    fs.rmSync(file);
    批.结束();
    return 还拿着;
  };
  expect(await 跑(`${String(Date.now() + 1).padStart(15, '0')}-${主机}-${process.ppid}`)).toBe(false);
  expect(await 跑(`${800000000000000 + Date.now() + 1}-${主机}-${process.ppid}`)).toBe(true);
});

it('--低优先 是全局参数，-- 之后的不算', () => {
  expect(取低优先参数(['render', '--低优先', '2-合照'])).toEqual({ 低优先: true, 其余: ['render', '2-合照'] });
  expect(取低优先参数(['mcai', '--', '--低优先'])).toEqual({ 低优先: false, 其余: ['mcai', '--', '--低优先'] });
});
