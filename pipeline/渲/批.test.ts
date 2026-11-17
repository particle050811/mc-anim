// anim batch 的契约：一条命令一个批闸、一项一个批项；默认每项开新浏览器、用完关（核对加载历史），--keep-browser 跨项复用；同一个包只读一次 Composition 列表；
// 每项写 sha.txt、默认只留最后一帧 PNG；一项失败记进结果、接着跑、退出码 1。渲染后端换假的（假后端.ts）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBackend } from './假后端.ts';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-批测试-'));
process.env.ANIM_DATA = dataRoot;
vi.mock('../环境/作品.ts', async (actual) => ({ ...(await actual<object>()), workName: () => '测试作品' }));
vi.mock('../清单/清单.ts', async (actual) => ({ ...(await actual<object>()), selectSegs: async (keys: string[]) => keys.map((key) => ({ key, segment: { terrain: [] } })) }));

const { runBatch } = await import('./批.ts');
const { UsageError } = await import('../cli/参数.ts');
const { terrainUsageSegEnv } = await import('../../engine/段/地形环境.ts');

const setup = (o: { failSegment?: string } = {}) => {
  const browsers: { close: ReturnType<typeof vi.fn> }[] = [];
  const reads: string[] = [];
  const renders: { serveUrl: string; frames: number[]; env: Record<string, string> }[] = [];
  const f = fakeBackend({
    launchBrowser: (async () => {
      const b = { close: vi.fn(async () => {}) };
      browsers.push(b);
      return b;
    }) as never,
    readCompositions: (async (serveUrl: string) => {
      reads.push(serveUrl);
      return [{ id: '甲' }, { id: '乙' }];
    }) as never,
    renderFrames: (async (x: { serveUrl: string; frames: number[]; envVariables: Record<string, string>; composition: { id: string }; onFrameBuffer: (b: Buffer, f: number) => void }) => {
      renders.push({ serveUrl: x.serveUrl, frames: x.frames, env: x.envVariables });
      if (x.composition.id === o.failSegment) throw new Error('页面崩了');
      for (const fr of x.frames) x.onFrameBuffer(Buffer.from(`${x.serveUrl}-${fr}`), fr);
    }) as never,
  });
  return { ...f, browsers, reads, renders };
};

let dir = '';
const run = async (lines: string[], args: string[], backend: ReturnType<typeof setup>['backend']) => {
  const taskFile = path.join(dir, '任务.txt');
  fs.writeFileSync(taskFile, ['# 注释', ...lines, ''].join('\n'));
  const code = await runBatch([taskFile, path.join(dir, '出'), ...args], backend);
  // 结果.tsv、各项 日志.txt 是写入流，runBatch 只 end() 不等落盘（命令退出前会写完）
  const names = lines.map((l) => l.split(/\s+/)[3]!);
  await vi.waitFor(() => {
    expect(fs.readFileSync(path.join(dir, '出', '结果.tsv'), 'utf8').trim().split('\n')).toHaveLength(lines.length);
    for (const n of names) expect(fs.existsSync(path.join(dir, '出', n, '日志.txt'))).toBe(true);
  });
  return code;
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(dataRoot, '批-'));
  process.env.PKGS = JSON.stringify({ 新: '/包/新', 旧: '/包/旧' });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  delete process.env.PKGS;
  fs.rmSync(dataRoot, { recursive: true, force: true });
});

describe('batch', () => {
  it('一个批闸、一项一个批项；默认每项新浏览器用完关；同一个包只读一次列表；sha.txt 每帧一行，默认只留最后一帧', async () => {
    const f = setup();
    expect(await run(['新 甲 0-2 一', '旧 甲 5 二 留=全', '新 乙 3,7 三 留=3'], ['--coherent', '比两版'], f.backend)).toBe(0);
    expect(f.tickets.map((t) => t.decl)).toEqual([
      expect.objectContaining({ kind: '批', itemCount: 3, 连贯: { why: '比两版' }, segment: '甲', frameCount: 3, frame: '0-2' }),
      expect.objectContaining({ segment: '甲', frameCount: 1, frame: '5' }),
      expect.objectContaining({ segment: '乙', frameCount: 2, frame: '3,7' }),
    ]);
    expect(f.browsers).toHaveLength(3);
    for (const b of f.browsers) expect(b.close).toHaveBeenCalledOnce();
    expect(f.reads).toEqual(['/包/新', '/包/旧']);
    expect(f.renders.map((r) => [r.serveUrl, r.frames])).toEqual([['/包/新', [0, 1, 2]], ['/包/旧', [5]], ['/包/新', [3, 7]]]);
    expect(f.renders[0]!.env[terrainUsageSegEnv]).toBe('测试作品/甲');
    const out = path.join(dir, '出');
    expect(fs.readFileSync(path.join(out, '一', 'sha.txt'), 'utf8').trim().split('\n').map((l) => l.split('=')[0])).toEqual(['0', '1', '2']);
    expect(fs.readdirSync(path.join(out, '一')).filter((n) => n.endsWith('.png'))).toEqual(['0002.png']);
    expect(fs.readdirSync(path.join(out, '三')).filter((n) => n.endsWith('.png'))).toEqual(['0003.png']);
    expect(fs.readFileSync(path.join(out, '二', '0005.png'), 'utf8')).toBe('/包/旧-5');
    expect(fs.readFileSync(path.join(out, '结果.tsv'), 'utf8').trim().split('\n').map((l) => l.split('\t')[0])).toEqual(['一', '二', '三']);
  });

  it('--keep-browser 跨项用同一个浏览器，最后关一次；一项失败记进结果、接着跑，退出码 1', async () => {
    const f = setup({ failSegment: '甲' });
    expect(await run(['新 甲 0 一', '新 乙 1 二'], ['--keep-browser'], f.backend)).toBe(1);
    expect(f.browsers).toHaveLength(1);
    expect(f.browsers[0]!.close).toHaveBeenCalledOnce();
    expect(f.renders).toHaveLength(2);
    expect(fs.readFileSync(path.join(dir, '出', '结果.tsv'), 'utf8')).toMatch(/^一\t失败\t页面崩了\n二\t新\t乙/);
  });

  it('任务格式不对（包键不在 PKGS、名字带斜杠、帧号不合法）在开批闸之前报用法错误', async () => {
    for (const line of ['没有 甲 0 一', '新 甲 0 a/b', '新 甲 x 一']) {
      const f = setup();
      await expect(run([line], [], f.backend)).rejects.toThrow(UsageError);
      expect(f.tickets).toEqual([]);
    }
  });
});
