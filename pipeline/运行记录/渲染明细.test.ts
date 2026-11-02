import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { 明细报告, 明细收集, 清旧明细, 累计子孙, 解析换出, 解析等待, 读明细们, 算小结, 归类标签 } from './渲染明细.ts';

vi.mock('../环境/温度.ts', () => {
  const 无温度 = () => ({ 芯片最高温: null, 发热等级: null });
  return { 读温度: vi.fn(无温度), 读温度并行: vi.fn(async () => 无温度()), 无温度 };
});
let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-明细-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('渲染明细', () => {
  it('从 Remotion 的 verbose 日志取 delayRender，帧号和地址归到一类', () => {
    expect(解析等待('[Tab 0, delayRender()] "Waiting for R3F to render frame 12" handle was cleared after 7ms')).toEqual({ 标签: 'Waiting for R#F to render frame #', 毫秒: 7 });
    expect(解析等待('\u001b[90m[Tab 0, delayRender()] "取方块网格 http://localhost:3000/data/8cab.bin" handle was cleared after 2105ms\u001b[39m')).toEqual({ 标签: '取方块网格', 毫秒: 2105 });
    expect(解析等待('Seeking to frame 0 took 2778ms')).toBeNull();
    expect(归类标签('Loading root component - See https://remotion.dev/x if you experience a timeout')).toBe('Loading root component');
  });

  it('一帧的等待记到下一次进度那帧上；同帧数的进度回调不算新帧；短等待只进总表', () => {
    const c = new 明细收集('render:作/段:视频', 100);
    c.行('[Tab 0, delayRender()] "体素世界：还有 3 块区段" handle was cleared after 300ms');
    c.行('[Tab 0, delayRender()] "Setting the current frame to 1" handle was cleared after 5ms');
    const t = Date.now();
    c.帧完成(1, t + 1000);
    c.帧完成(1, t + 1100);
    c.帧完成(3, t + 1400);
    expect(c.帧们.map((f) => [f.帧, f.毫秒 >= 100])).toEqual([[100, true], [101, true], [102, true]]);
    expect(c.帧们[1]!.毫秒).toBe(200);
    expect(c.帧们[0]!.等).toEqual({ '体素世界：还有 # 块区段': 300 });
    expect(c.帧们[1]!.等).toBeUndefined();
  });

  it('包 把 console.log 收走、结束还原，抛错也还原', async () => {
    const 原 = console.log;
    const c = new 明细收集('x');
    await expect(c.包(async () => {
      console.log('[Tab 0, delayRender()] "a" handle was cleared after 9ms');
      expect(console.log).not.toBe(原);
      throw new Error('渲崩了');
    })).rejects.toThrow('渲崩了');
    expect(console.log).toBe(原);
    const { 明细 } = await c.写出([], {}, dir);
    expect(明细.等待).toEqual([{ 标签: 'a', 次: 1, 总毫秒: 9, 最大毫秒: 9 }]);
    expect(明细.系统.length).toBeGreaterThanOrEqual(1);
  });

  it('小结：首帧单算，分位只看后面', () => {
    const s = 算小结([{ 帧: 0, 毫秒: 9000 }, ...Array.from({ length: 10 }, (_, i) => ({ 帧: i + 1, 毫秒: (i + 1) * 10 }))]);
    expect(s).toMatchObject({ 帧数: 11, 首帧毫秒: 9000, 中位毫秒: 60, P90毫秒: 100 });
    expect(s.最慢帧[0]).toEqual({ 帧: 10, 毫秒: 100 });
  });

  it('子孙进程按 ppid 累计，不算自己和无关进程；换出解析', () => {
    const ps = '100 1 1024 10\n200 100 2048 20.5\n300 200 1024 30\n400 1 9999 99\n';
    expect(累计子孙(ps, 100)).toEqual({ 内存GB: 0, CPU: 51 });
    expect(解析换出('total = 2048.00M  used = 512.00M  free = 1536.00M')).toBe(0.5);
    expect(解析换出('total = 0.00M  used = 2.00G')).toBe(2);
    expect(解析换出('什么也没有')).toBeNull();
  });

  it('写出、读回、过滤，只留最近几份，报告不崩', async () => {
    const c = new 明细收集('render:作/甲段:视频');
    c.帧完成(1);
    c.帧完成(2);
    const { 文件 } = await c.写出([{ 标签: 'render:作/甲段:视频', 阶段: '出帧', 开始: '2026-10-31T00:00:00Z', 秒: 1 }, { 标签: '别的', 阶段: '打包', 开始: '2026-10-31T00:00:00Z', 秒: 1 }], { 浏览器: '自带' }, dir);
    expect(fs.existsSync(文件!)).toBe(true);
    const [读] = 读明细们({ 含: '作/甲段', 目录: dir });
    expect(读!.明细.阶段.map((r) => r.阶段)).toEqual(['出帧']);
    expect(读明细们({ 含: '乙段', 目录: dir })).toEqual([]);
    expect(明细报告(读!.明细, 读!.文件)).toContain('render:作/甲段:视频');
    for (const n of ['a', 'b', 'c']) fs.writeFileSync(path.join(dir, `0-${n}.json`), '{}');
    清旧明细(dir, 2);
    expect(fs.readdirSync(dir).length).toBe(3); // 每种各保留两份，其他种的明细不被挤掉
  });

  it('目录里有半截文件：照样写出、不误报，半截的也按种轮转', async () => {
    const 半截 = (n: number) => path.join(dir, `2026010${n}-000000-render_作_乙段_视频-1.json`);
    for (const n of [1, 2, 3]) fs.writeFileSync(半截(n), '{"标签":"render:作/乙');
    const 错 = vi.spyOn(console, 'error');
    const c = new 明细收集('render:作/甲段:视频');
    c.帧完成(1);
    const { 文件 } = await c.写出([], {}, dir);
    expect(错).not.toHaveBeenCalled();
    错.mockRestore();
    expect(JSON.parse(fs.readFileSync(文件!, 'utf8')).标签).toBe('render:作/甲段:视频');
    清旧明细(dir, 2);
    expect(fs.existsSync(半截(1))).toBe(false);
    expect(fs.existsSync(半截(2))).toBe(false);
    expect(fs.existsSync(半截(3))).toBe(true);
    expect(fs.existsSync(文件!)).toBe(true);
  });
});
