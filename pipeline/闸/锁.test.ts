// 锁协议：互斥、死锁回收、空文件宽限、跨主机不回收、排队票的先后，以及和旧项目 锁.py 互斥（旧项目在本机时才跑）。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { 配置 } from '../环境/配置.ts';
import { 排队拿 } from './闸.ts';
import { 持有者, 回收死锁, 试拿, 放, 进程起于, 锁被占 } from './锁.ts';
import { 主机片段, 票活着 } from './票.ts';

const 锁模块 = path.join(import.meta.dirname, '锁.ts');
const 旧工具目录 = path.join(配置('旧项目'), '参考模型库', '工具');
const 有旧项目 = fs.existsSync(path.join(旧工具目录, '公共', '锁.py'));
const 本机 = os.hostname();

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-锁测试-'));
  file = path.join(dir, '渲染.lock');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** 一个已经退出的进程的 pid */
const 死pid = () => spawnSync(process.execPath, ['-e', '0']).pid!;

/** 起一个子进程，ready 行打出来以后返回；它一直挂着直到被杀 */
const 起持锁进程 = (cmd: string, args: string[], env: NodeJS.ProcessEnv = {}) =>
  new Promise<{ pid: number; 输出: string; 杀: () => Promise<void> }>((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      out += d;
      if (out.includes('\n'))
        resolve({
          pid: child.pid!,
          输出: out.trim(),
          杀: () =>
            new Promise((r) => {
              child.once('exit', () => r());
              child.kill('SIGKILL');
            }),
        });
    });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`子进程提前退出 ${code}：${out}`)));
  });

const node持锁 = (f: string) =>
  起持锁进程(process.execPath, ['--input-type=module', '-e', `import {试拿} from ${JSON.stringify(锁模块)}; console.log(试拿(${JSON.stringify(f)}, ${JSON.stringify(本机)})); setInterval(() => {}, 1000);`]);

const py = (code: string) => ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(旧工具目录)}); from pathlib import Path; from 公共 import 锁\n${code}`];
const 旧Python = process.platform === 'win32' ? 'python' : 'python3';
const pyEnv = { PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8' };

describe('锁协议', () => {
  it('拿到以后别的进程拿不到，放了才能拿', async () => {
    const 子 = await node持锁(file);
    expect(子.输出).toBe('true');
    expect(持有者(file)).toBe(子.pid);
    expect(试拿(file, 本机)).toBe(false);
    await 子.杀();
    // 持有者死了：回收
    expect(试拿(file, 本机)).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe(`${process.pid}\n`);
    放(file);
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('锁文件里只有 pid（旧 锁.py 只认纯数字）', () => {
    expect(试拿(file, 本机)).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toMatch(/^\d+\n$/);
    expect(fs.readFileSync(`${file}.${process.pid}.主机`, 'utf8').trim()).toBe(本机);
    放(file);
  });

  it('刚建出来的空文件 10 秒内当有人拿着，过了就回收', () => {
    fs.writeFileSync(file, '');
    expect(试拿(file, 本机)).toBe(false);
    const old = new Date(Date.now() - 11_000);
    fs.utimesSync(file, old, old);
    expect(试拿(file, 本机)).toBe(true);
    放(file);
  });

  it('持有者在别的主机上：查不了 pid，当它活着', () => {
    const pid = 死pid();
    fs.writeFileSync(file, `${pid}\n`);
    fs.writeFileSync(`${file}.${pid}.主机`, '别的机器\n');
    expect(试拿(file, 本机)).toBe(false);
    fs.writeFileSync(`${file}.${pid}.主机`, `${本机}\n`);
    expect(试拿(file, 本机)).toBe(true);
    expect(fs.existsSync(`${file}.${pid}.主机`)).toBe(false);
    放(file);
  });

  it('只放自己拿着的', () => {
    fs.writeFileSync(file, `${死pid()}\n`);
    放(file);
    expect(fs.existsSync(file)).toBe(true);
  });
});

describe('pid 被复用', () => {
  const 十分钟前 = () => new Date(Date.now() - 600_000);
  it.skipIf(process.platform === 'win32')('活进程启动比锁、票晚很多：算死，回收并回调；票还在更新就不用查', async () => {
    const c = spawn('sleep', ['30']);
    try {
      fs.writeFileSync(file, `${c.pid}\n`);
      fs.utimesSync(file, 十分钟前(), 十分钟前());
      expect(锁被占(file, 本机)).toBe(false);
      const 回收了: (number | null)[] = [];
      回收死锁(file, 本机, p => 回收了.push(p));
      expect(fs.existsSync(file)).toBe(false);
      expect(回收了).toEqual([c.pid]);
      const 票文件 = path.join(dir, '票'), 票 = { 名: '票', 文件: 票文件, pid: c.pid!, 主机: 主机片段(本机), 时间: 0, 内容: null };
      fs.writeFileSync(票文件, '');
      expect(票活着(票, 本机)).toBe(true);
      fs.utimesSync(票文件, 十分钟前(), 十分钟前());
      expect(票活着(票, 本机)).toBe(false);
    } finally {
      c.kill('SIGKILL');
    }
  });
  const 一号起于 = process.platform === 'win32' ? null : 进程起于(1);
  it.skipIf(!一号起于 || Date.now() - 一号起于 < 900_000)('进程比锁早（真持有者占了很久）不算换人', () => {
    fs.writeFileSync(file, '1\n');
    fs.utimesSync(file, 十分钟前(), 十分钟前());
    expect(锁被占(file, 本机)).toBe(true);
    回收死锁(file, 本机);
    expect(fs.existsSync(file)).toBe(true);
    expect(试拿(file, 本机)).toBe(false);
  });
});

describe('回收门', () => {
  it('有人在门里：这轮不回收也不空转；门走了下一轮回收，什么都不留', () => {
    fs.writeFileSync(file, `${死pid()}\n`);
    fs.writeFileSync(`${file}.回收`, '');
    const 起 = performance.now();
    expect(试拿(file, 本机)).toBe(false);
    回收死锁(file, 本机);
    expect(performance.now() - 起).toBeLessThan(1000);
    expect(fs.existsSync(file)).toBe(true);
    fs.rmSync(`${file}.回收`);
    expect(试拿(file, 本机)).toBe(true);
    放(file);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
  it('门留下了（回收者死在门里）过 10 秒作废', () => {
    fs.writeFileSync(file, `${死pid()}\n`);
    fs.writeFileSync(`${file}.回收`, '');
    const old = new Date(Date.now() - 11_000);
    fs.utimesSync(`${file}.回收`, old, old);
    expect(试拿(file, 本机)).toBe(false);
    expect(试拿(file, 本机)).toBe(true);
    放(file);
  });
  it('多进程紧循环抢回收：从不同时两个持有者', async () => {
    const 工人 = Array.from({ length: 4 }, () => new Promise<string>((r) => {
      const p = spawn(process.execPath, [path.join(import.meta.dirname, 'fixtures/回收竞争.ts'), file, path.join(dir, '占位'), String(死pid()), '1500'], { stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.on('close', () => r(out));
    }));
    const 合 = (await Promise.all(工人)).map((x) => JSON.parse(x) as { 拿到: number; 重叠: number; 回收: number });
    expect(合.reduce((n, x) => n + x.回收, 0)).toBeGreaterThan(0);
    expect(合.reduce((n, x) => n + x.重叠, 0)).toBe(0);
  }, 15_000);
});

describe('排队票', () => {
  it('按领票先后拿锁，不插队', async () => {
    const 锁 = path.join(dir, '渲染.lock');
    const 子 = await node持锁(锁);
    const 顺序: string[] = [];
    const 甲 = 排队拿('渲染', { 锁目录: dir, 本机, 间隔毫秒: 30 }).then((柄) => {
      顺序.push('甲');
      return 柄;
    });
    await new Promise((r) => setTimeout(r, 20));
    const 乙 = 排队拿('渲染', { 锁目录: dir, 本机, 间隔毫秒: 30 }).then((柄) => {
      顺序.push('乙');
      return 柄;
    });
    await new Promise((r) => setTimeout(r, 100));
    // 同进程串行领票，避免按 pid 查找时两张活票歧义；顺序仍由下面的断言核对。
    expect(fs.readdirSync(path.join(dir, '渲染.排队'))).toHaveLength(1);
    await 子.杀();
    const 甲柄 = await 甲;
    await new Promise((r) => setTimeout(r, 150));
    expect(顺序).toEqual(['甲']); // 甲拿着，乙在等
    甲柄.放();
    (await 乙).放();
    expect(顺序).toEqual(['甲', '乙']);
    expect(fs.readdirSync(path.join(dir, '渲染.排队'))).toEqual([]);
  });

  it('死掉的票不挡路', async () => {
    const 票目录 = path.join(dir, '渲染.排队');
    fs.mkdirSync(票目录);
    fs.writeFileSync(path.join(票目录, `${'1'.padStart(15, '0')}-${本机.replace(/[^A-Za-z0-9._-]/g, '_')}-${死pid()}`), '');
    const 柄 = await 排队拿('渲染', { 锁目录: dir, 本机, 间隔毫秒: 30 });
    柄.放();
    expect(fs.readdirSync(票目录)).toEqual([]);
  });
});

describe.skipIf(!有旧项目)('和旧项目 锁.py 互斥', () => {
  it('旧 Python 拿着时 anim 拿不到；它死了 anim 能回收', async () => {
    const 子 = await 起持锁进程(旧Python, py(`print(锁.试拿(Path(${JSON.stringify(file)})), flush=True)\nimport time\nwhile True: time.sleep(1)`), pyEnv);
    expect(子.输出).toBe('True');
    expect(试拿(file, 本机)).toBe(false);
    await 子.杀();
    expect(试拿(file, 本机)).toBe(true);
    放(file);
  });

  it('anim 拿着时旧 Python 拿不到、读得出持有者 pid', () => {
    expect(试拿(file, 本机)).toBe(true);
    const r = spawnSync(旧Python, py(`p = Path(${JSON.stringify(file)}); print(锁.试拿(p), 锁.持有者(p))`), { env: { ...process.env, ...pyEnv }, encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.stdout.trim()).toBe(`False ${process.pid}`);
    放(file);
  });

  it('anim 的持有者死了，旧 Python 能回收', async () => {
    const 子 = await node持锁(file);
    await 子.杀();
    const r = spawnSync(旧Python, py(`p = Path(${JSON.stringify(file)}); print(锁.试拿(p)); 锁.放(p)`), { env: { ...process.env, ...pyEnv }, encoding: 'utf8' });
    expect(r.stdout.trim()).toBe('True');
    expect(fs.existsSync(file)).toBe(false);
    // 它留下的 .主机 文件，anim 下次拿到锁时扫掉
    expect(fs.existsSync(`${file}.${子.pid}.主机`)).toBe(true);
    expect(试拿(file, 本机)).toBe(true);
    放(file);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
