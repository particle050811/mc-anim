// anim cues 的生成和核对：临时目录里放一个窗口段（@engine 按真的代码根解析），数用假的、不量音频。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { 段定义 } from '../../engine/段/段定义.ts';
import type { 资产锁 } from '../资产/资产锁.ts';
import { 代码根 } from '../环境/路径.ts';
import { 声音地址文件, 声音表文件, 新鲜执行, 核对一段, 生成一段, type 生成环境 } from './生成.ts';

const 锁: 资产锁 = {
  '音效/门': { sha256: 'a'.repeat(64), 大小: 1, 库: 'store', 后缀: '.ogg' },
  '配音/甲': { sha256: 'b'.repeat(64), 大小: 1, 库: 'store', 后缀: '.wav' },
  '配乐/私': { sha256: 'c'.repeat(64), 大小: 1, 库: '私有', 后缀: '.wav' },
};
const 数 = { '音效/门': { 时长: 1, 峰值: -6 }, '配音/甲': { 时长: 2, 峰值: -3 }, '配乐/私': { 时长: 60, 峰值: -1, 响度: -14 } } as const;

let 目录: string;
let 量过: string[];
const 环境 = (o: Partial<生成环境> = {}): 生成环境 => ({
  锁,
  台词表: [{ id: '甲', 配音: '配音/甲', 开口: 0.5 }],
  取数: (id) => {
    量过.push(id);
    return 数[id as keyof typeof 数];
  },
  ...o,
});
const 写段 = (声音: string) =>
  fs.writeFileSync(
    path.join(目录, '段.ts'),
    `import { 定义场时间线, 窗口段 } from '@engine/段/窗口段.ts';
import 声音表 from './声音表.生成.ts';
const 线 = 定义场时间线({ 场: '核对', 事件: { 起: { 在: { 秒: 0 } }, 响: { 在: { 秒: 0.5 } }, 止: { 在: { 秒: 2 } } } });
export default 窗口段(线, { 起: '起', 止: '止', 声音表, 声音: ({ 放, 说, 接着说, 事件 }) => [${声音}] });
`,
  );
const 根 = 代码根();

beforeEach(() => {
  目录 = fs.mkdtempSync(path.join(os.tmpdir(), '段框架-生成-'));
  量过 = [];
});
afterEach(() => fs.rmSync(目录, { recursive: true, force: true }));

describe('生成一段', () => {
  it('没有声音表也能起步：收集用到的声音、写两份文件；再跑一次不改', async () => {
    写段(`放('音效/门', 事件.响, -12), 说('甲', 事件.响), 放('配乐/私', 0, { 响度: -20, 名: '歌' })`);
    const r = await 生成一段(path.join(目录, '段.ts'), 根, 环境());
    expect(r.改了).toEqual([声音表文件, 声音地址文件]);
    expect(r.段.声音).toEqual([
      { 帧: 12, 资产: '音效/门', 名: '门', 帧数: 24, 增益: 0.501187 },
      { 帧: 12, 台词: '甲' },
      { 帧: 0, 资产: '配乐/私', 名: '歌', 帧数: 48, 增益: 0.501187 },
    ]);
    expect(r.表.台词).toEqual({ 甲: { 配音: '配音/甲', 开口: 0.5, 时长: 2 } });
    const 地址 = fs.readFileSync(path.join(目录, 声音地址文件), 'utf8');
    expect(地址).toContain(`import 声0 from "asset:配音/甲";`);
    expect(地址).toContain(`"配乐/私": 私有配乐("配乐/私")`);
    expect(地址).not.toContain('asset:配乐/私');
    const 表 = (await 新鲜执行(path.join(目录, 声音表文件), 根)).default;
    expect(表).toEqual(r.表);
    const 再 = await 生成一段(path.join(目录, '段.ts'), 根, 环境());
    expect(再.改了).toEqual([]);
  });

  it('核对：cue 对得上返回空；加一声报出来；锁里、缓存里没数的沿用盘上的，没有就报', async () => {
    写段(`放('音效/门', 事件.响, -12)`);
    await 生成一段(path.join(目录, '段.ts'), 根, 环境());
    const 段 = (await 新鲜执行(path.join(目录, '段.ts'), 根)).default as 段定义;
    const 不量 = { ...环境(), 取数: () => undefined };
    expect(await 核对一段(段, 目录, 根, 不量)).toEqual([]);
    const 加了 = { ...段, 声音: [...(段.声音 ?? []), { 帧: 0, 资产: '配乐/私', 名: '歌', 帧数: 10 }] } as 段定义;
    expect((await 核对一段(加了, 目录, 根, 不量)).join('\n')).toMatch(/声音表里没有「配乐\/私」/);
    const 问题 = await 核对一段(加了, 目录, 根, { ...不量, 取数: (id: string) => 数[id as keyof typeof 数] });
    expect(问题.map((x) => x.split(' ')[0])).toEqual([声音表文件, 声音地址文件]);
    fs.rmSync(path.join(目录, 声音地址文件));
    expect(await 核对一段(段, 目录, 根, 不量)).toEqual([`缺 ${声音表文件} 或 ${声音地址文件}：跑 anim cues`]);
  });

  it('声音表记 sha：换机器重跑沿用盘上 sha 对得上的数、不重量；字节换了（同 id 新 sha）核对报、重跑重量', async () => {
    写段(`放('音效/门', 事件.响, -12)`);
    const r = await 生成一段(path.join(目录, '段.ts'), 根, 环境());
    expect(r.表.资产['音效/门']).toEqual({ 时长: 1, 峰值: -6, sha: 'a'.repeat(12) });
    量过 = [];
    await 生成一段(path.join(目录, '段.ts'), 根, 环境({ 取数: () => ({ 时长: 1.01, 峰值: -6.01 }) }));
    expect((await 新鲜执行(path.join(目录, 声音表文件), 根)).default).toEqual(r.表);
    const 段 = (await 新鲜执行(path.join(目录, '段.ts'), 根)).default as 段定义;
    const 新锁 = { ...锁, '音效/门': { ...锁['音效/门']!, sha256: 'd'.repeat(64) } };
    const 不量 = { ...环境(), 锁: 新锁, 取数: () => undefined };
    expect((await 核对一段(段, 目录, 根, 不量)).join('\n')).toMatch(/「音效\/门」的字节换了（锁里 sha d{12}，声音表里 a{12}）/);
    const 再 = await 生成一段(path.join(目录, '段.ts'), 根, 环境({ 锁: 新锁, 取数: () => ({ 时长: 3, 峰值: -6 }) }));
    expect(再.表.资产['音效/门']).toEqual({ 时长: 3, 峰值: -6, sha: 'd'.repeat(12) });
    expect(再.段.声音?.[0]).toMatchObject({ 帧数: 36 });
  });

  it('场声音：生成时收进表和地址表；一定不沾边的不进表；要过数但没落进窗口的留在表里，再跑不来回翻', async () => {
    const 写场段 = (门秒: number) =>
      fs.writeFileSync(
        path.join(目录, '段.ts'),
        `import { 定义场时间线, 窗口段 } from '@engine/段/窗口段.ts';
import 声音表 from './声音表.生成.ts';
const 线 = 定义场时间线({
  场: '核对',
  事件: { 起: { 在: { 秒: 0 } }, 切: { 在: { 秒: 2 } }, 止: { 在: { 秒: 4 } } },
  声音: [{ 资产: '音效/门', 在: { 秒: ${门秒} }, 峰值: -12 }, { 资产: '配乐/私', 在: { 秒: 3 }, 增益: 0.5 }],
});
export default 窗口段(线, { 起: '切', 止: { 帧数: 24 }, 声音表 });
`,
      );
    // 窗口 [48, 72)：门 从 36 起放 24 帧，剩 12 帧落进来；私 从 72 起，一定不沾边
    写场段(1.5);
    const r = await 生成一段(path.join(目录, '段.ts'), 根, 环境());
    expect(r.段.声音).toEqual([{ 帧: 0, 资产: '音效/门', 名: '门', 帧数: 12, 入点秒: 0.5, 增益: 0.501187 }]);
    expect(Object.keys(r.表.资产)).toEqual(['音效/门']);
    expect(fs.readFileSync(path.join(目录, 声音地址文件), 'utf8')).toContain('asset:音效/门');
    // 门 改在第 0 秒：起在窗口前、要过数才知道放多长，放完（24 帧）也没到窗口：留在表里，地址表里没有它；再跑一次不改
    写场段(0);
    const 前 = await 生成一段(path.join(目录, '段.ts'), 根, 环境());
    expect([前.段.声音, Object.keys(前.表.资产)]).toEqual([undefined, ['音效/门']]);
    expect(fs.readFileSync(path.join(目录, 声音地址文件), 'utf8')).not.toContain('asset:');
    expect((await 生成一段(path.join(目录, '段.ts'), 根, 环境())).改了).toEqual([]);
    const 段 = (await 新鲜执行(path.join(目录, '段.ts'), 根)).default as 段定义;
    expect(await 核对一段(段, 目录, 根, { ...环境(), 取数: () => undefined })).toEqual([]);
  });

  it('不是窗口段做的段：报错，起步时写的空表删掉', async () => {
    fs.writeFileSync(path.join(目录, '段.ts'), `export default { 场: '核对', 帧数: 10, fps: 24, 宽: 1, 高: 1, 地形: [] };\n`);
    await expect(生成一段(path.join(目录, '段.ts'), 根, 环境())).rejects.toThrow(/不是段框架的段/);
    expect(fs.existsSync(path.join(目录, 声音表文件))).toBe(false);
  });

  it('跨段的接上段：从上一段算 上段开口帧；没有上一段就报错', async () => {
    写段(`接着说('甲', 0)`);
    const 上: 段定义 = { 帧数: 48, fps: 24, 声音: [{ 帧: 40, 台词: '甲' }] } as unknown as 段定义;
    const r = await 生成一段(path.join(目录, '段.ts'), 根, 环境({ 上一段: async () => 上 }));
    expect(r.表.台词.甲).toEqual({ 配音: '配音/甲', 开口: 0.5, 时长: 2, 上段开口帧: -8 });
    fs.rmSync(path.join(目录, 声音表文件));
    await expect(生成一段(path.join(目录, '段.ts'), 根, 环境())).rejects.toThrow(/接上段/);
  });
});
