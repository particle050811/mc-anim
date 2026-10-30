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

  it('跨段的接上段：从上一段算 上段开口帧；没有上一段就报错', async () => {
    写段(`接着说('甲', 0)`);
    const 上: 段定义 = { 帧数: 48, fps: 24, 声音: [{ 帧: 40, 台词: '甲' }] } as unknown as 段定义;
    const r = await 生成一段(path.join(目录, '段.ts'), 根, 环境({ 上一段: async () => 上 }));
    expect(r.表.台词.甲).toEqual({ 配音: '配音/甲', 开口: 0.5, 时长: 2, 上段开口帧: -8 });
    fs.rmSync(path.join(目录, 声音表文件));
    await expect(生成一段(path.join(目录, '段.ts'), 根, 环境())).rejects.toThrow(/接上段/);
  });
});
