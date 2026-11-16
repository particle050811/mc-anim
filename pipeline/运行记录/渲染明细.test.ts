import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detailReport, DetailCollector, clearOldDetails, sumDescendants, parseSwapOut, parseWait, readDetailList, computeSummary, classifyLabel } from './渲染明细.ts';

vi.mock('../环境/温度.ts', () => {
  const noTempReading = () => ({ chipMaxTemp: null, thermalLevel: null });
  return { readTemperature: vi.fn(noTempReading), readTempParallel: vi.fn(async () => noTempReading()), noTempReading };
});
let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-明细-'));
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });

describe('渲染明细', () => {
  it('从 Remotion 的 verbose 日志取 delayRender，帧号和地址归到一类', () => {
    expect(parseWait('[Tab 0, delayRender()] "Waiting for R3F to render frame 12" handle was cleared after 7ms')).toEqual({ label: 'Waiting for R#F to render frame #', ms: 7 });
    expect(parseWait('\u001b[90m[Tab 0, delayRender()] "取方块网格 http://localhost:3000/data/8cab.bin" handle was cleared after 2105ms\u001b[39m')).toEqual({ label: '取方块网格', ms: 2105 });
    expect(parseWait('Seeking to frame 0 took 2778ms')).toBeNull();
    expect(classifyLabel('Loading root component - See https://remotion.dev/x if you experience a timeout')).toBe('Loading root component');
  });

  it('识别 Remotion 彩色标签（Windows 默认）、CRLF 和 Windows 路径，不把普通日志当等待', () => {
    const line = '\x1b[40m Tab 0, delayRender() \x1b[49m \x1b[90m"Waiting for R3F to render frame 12" handle was cleared after 27ms\x1b[39m\r\n';
    expect(parseWait(line)).toEqual({ label: 'Waiting for R#F to render frame #', ms: 27 });
    expect(parseWait('[Tab 0, delayRender()] "读取 D:\\cache\\mesh.bin" handle was cleared after 42ms\r\n')).toEqual({ label: '读取 D:\\cache\\mesh.bin', ms: 42 });
    expect(parseWait('\x1b[40m Tab 0, node_modules/three/build/three.core.js:2022 \x1b[49m THREE.Clock: This module has been deprecated.')).toBeNull();
    const c = new DetailCollector('bench:作/段:视频');
    c.行(line);
    c.frameDone(1);
    expect(c.frameRecords[0]!.waits).toEqual({ 'Waiting for R#F to render frame #': 27 });
  });

  it('Windows results/third/B2-tower 的原始彩色等待行能解析，两条不丢失', () => {
    const lines = ["\u001b[40m Tab 1, delayRender() \u001b[49m \u001b[90m\u001b[90m\"体素世界：还有 361 块区段\" handle was cleared after 968ms\u001b[39m\u001b[90m\u001b[39m", "\u001b[40m Tab 0, delayRender() \u001b[49m \u001b[90m\u001b[90m\"体素世界：还有 380 块区段\" handle was cleared after 972ms\u001b[39m\u001b[90m\u001b[39m"];
    expect(lines.map(parseWait)).toEqual([
      { label: '体素世界：还有 # 块区段', ms: 968 },
      { label: '体素世界：还有 # 块区段', ms: 972 },
    ]);
  });

  it('直接用当前 Remotion 格式化器核对有色和无色的等待标签', () => {
    const require = createRequire(import.meta.url);
    const { Log } = require(path.join(path.dirname(require.resolve('@remotion/renderer')), 'logger.js'));
    for (const colored of [false, true]) {
      vi.unstubAllEnvs();
      if (colored) { vi.stubEnv('FORCE_COLOR', '1'); vi.stubEnv('NO_COLOR', undefined); }
      else vi.stubEnv('NO_COLOR', '1');
      const line = Log.formatLogs('verbose', { indent: false, logLevel: 'verbose', tag: 'Tab 0, delayRender()' }, ['"Waiting for R3F to render frame 12" handle was cleared after 27ms']).join(' ');
      expect(parseWait(line + '\r\n')).toEqual({ label: 'Waiting for R#F to render frame #', ms: 27 });
    }
  });

  it('一帧的等待记到下一次进度那帧上；同帧数的进度回调不算新帧；短等待只进总表', () => {
    const c = new DetailCollector('render:作/段:视频', 100);
    c.行('[Tab 0, delayRender()] "体素世界：还有 3 块区段" handle was cleared after 300ms');
    c.行('[Tab 0, delayRender()] "Setting the current frame to 1" handle was cleared after 5ms');
    const t = Date.now();
    c.frameDone(1, t + 1000);
    c.frameDone(1, t + 1100);
    c.frameDone(3, t + 1400);
    expect(c.frameRecords.map((f) => [f.frame, f.ms >= 100])).toEqual([[100, true], [101, true], [102, true]]);
    expect(c.frameRecords[1]!.ms).toBe(200);
    expect(c.frameRecords[0]!.waits).toEqual({ '体素世界：还有 # 块区段': 300 });
    expect(c.frameRecords[1]!.waits).toBeUndefined();
  });

  it('包 把 console.log 收走、结束还原，抛错也还原', async () => {
    const originalLog = console.log;
    const c = new DetailCollector('x');
    await expect(c.pack(async () => {
      console.log('[Tab 0, delayRender()] "a" handle was cleared after 9ms');
      expect(console.log).not.toBe(originalLog);
      throw new Error('渲崩了');
    })).rejects.toThrow('渲崩了');
    expect(console.log).toBe(originalLog);
    const { detail: detail } = await c.writeOut([], {}, dir);
    expect(detail.waiting).toEqual([{ label: 'a', count: 1, totalMs: 9, maxMs: 9 }]);
    expect(detail.system.length).toBeGreaterThanOrEqual(1);
  });

  it('小结：首帧单算，分位只看后面', () => {
    const s = computeSummary([{ frame: 0, ms: 9000 }, ...Array.from({ length: 10 }, (_, i) => ({ frame: i + 1, ms: (i + 1) * 10 }))]);
    expect(s).toMatchObject({ frameCount: 11, firstFrameMs: 9000, medianMs: 60, p90Ms: 100 });
    expect(s.slowestFrames[0]).toEqual({ frame: 10, ms: 100 });
  });

  it('子孙进程按 ppid 累计，不算自己和无关进程；换出解析', () => {
    const ps = '100 1 1024 10\n200 100 2048 20.5\n300 200 1024 30\n400 1 9999 99\n';
    expect(sumDescendants(ps, 100)).toEqual({ memoryGb: 0, CPU: 51 });
    expect(parseSwapOut('total = 2048.00M  used = 512.00M  free = 1536.00M')).toBe(0.5);
    expect(parseSwapOut('total = 0.00M  used = 2.00G')).toBe(2);
    expect(parseSwapOut('什么也没有')).toBeNull();
  });

  it('子进程连孙子都算', () => {
    // 100 是本进程；200 浏览器；300 子进程，400 是它的 ffmpeg；500 无关
    const ps = '100 1 1024 10\n200 100 2048 20\n300 100 1048576 5\n400 300 2097152 300\n500 1 9999 99\n';
    expect(sumDescendants(ps, 100)).toEqual({ memoryGb: 3, CPU: 325 });
  });

  it('写出、读回、过滤，只留最近几份，报告不崩', async () => {
    const c = new DetailCollector('render:作/甲段:视频');
    c.frameDone(1);
    c.frameDone(2);
    const { file: file } = await c.writeOut([{ label: 'render:作/甲段:视频', stage: '出帧', startedAt: '2026-10-31T00:00:00Z', sec: 1 }, { label: '别的', stage: '打包', startedAt: '2026-10-31T00:00:00Z', sec: 1 }], { browser: '自带' }, dir);
    expect(fs.existsSync(file!)).toBe(true);
    const [record] = readDetailList({ contains: '作/甲段', 目录: dir });
    expect(record!.detail.stage.map((r) => r.stage)).toEqual(['出帧']);
    expect(readDetailList({ contains: '乙段', 目录: dir })).toEqual([]);
    expect(detailReport(record!.detail, record!.file)).toContain('render:作/甲段:视频');
    for (const n of ['a', 'b', 'c']) fs.writeFileSync(path.join(dir, `0-${n}.json`), '{}');
    clearOldDetails(dir, 2);
    expect(fs.readdirSync(dir).length).toBe(3); // 每种各保留两份，其他种的明细不被挤掉
  });

  it('目录里有半截文件：照样写出、不误报，半截的也按种轮转', async () => {
    const partialFile = (n: number) => path.join(dir, `2026010${n}-000000-render_作_乙段_视频-1.json`);
    for (const n of [1, 2, 3]) fs.writeFileSync(partialFile(n), '{"标签":"render:作/乙');
    const errorSpy = vi.spyOn(console, 'error');
    const c = new DetailCollector('render:作/甲段:视频');
    c.frameDone(1);
    const { file: file } = await c.writeOut([], {}, dir);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    expect(JSON.parse(fs.readFileSync(file!, 'utf8')).label).toBe('render:作/甲段:视频');
    clearOldDetails(dir, 2);
    expect(fs.existsSync(partialFile(1))).toBe(false);
    expect(fs.existsSync(partialFile(2))).toBe(false);
    expect(fs.existsSync(partialFile(3))).toBe(true);
    expect(fs.existsSync(file!)).toBe(true);
  });
});
