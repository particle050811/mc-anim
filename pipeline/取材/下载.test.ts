// jars.toml 的「根 = 数据」「也认」和 anim extract --下载：数据根、游戏目录都是临时目录，下载换成假的（不连网）。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// 配置读得懒，下面动态 import 之前设好就行
const 临时 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-下载测试-')));
process.env.ANIM_DATA = path.join(临时, '数据');
process.env.ANIM_GAME = path.join(临时, '游戏');
afterAll(() => fs.rmSync(临时, { recursive: true, force: true }));

const { 解析清单, 拆位置 } = await import('./清单.ts');
const { jar登记路径, jar路径 } = await import('./提取.ts');
const { 下载, 下载清单, 能下载 } = await import('./下载.ts');

const 内容 = '# 映射文件头\nnet.minecraft.A -> a:\n';
const sha = (算法: string, s: string) => crypto.createHash(算法).update(s).digest('hex');

const jars = (sha256 = sha('sha256', 内容)) => `
[["Mojang"."映射"]]
"id" = "映射甲"
"根" = "数据"
"到" = "cache/映射/甲.txt"
"也认" = ["游戏:缓存/甲.txt"]
"下载" = "https://example.invalid/甲.txt"
"sha256" = "${sha256}"
"sha1" = "${sha('sha1', 内容)}"
[["模组"]]
"id" = "模组乙"
"到" = "mods/乙.jar"
"下载" = "https://example.invalid/乙.jar"
"sha256" = "${'0'.repeat(64)}"
`;

describe('jars.toml 的根和也认', () => {
  it('根只认 游戏、mc资源、数据；也认 写成 <根>:<路径>，不写根按游戏', () => {
    expect(拆位置('游戏:缓存/a.txt')).toEqual(['游戏', '缓存/a.txt']);
    expect(拆位置('缓存/a.txt')).toEqual(['游戏', '缓存/a.txt']);
    expect(() => 拆位置('别处:a.txt')).toThrow(/根只认/);
    expect(() => 解析清单('', '[["模组"]]\n"id" = "x"\n"根" = "别处"\n"到" = "a"\n')).toThrow(/根只认/);
  });

  it('「到」在就用它；不在找也认的位置；都没有返回「到」', () => {
    const q = 解析清单('', jars());
    const 主 = path.join(临时, '数据', 'cache', '映射', '甲.txt');
    const 游戏里 = path.join(临时, '游戏', '缓存', '甲.txt');
    expect(jar登记路径(q.jars.get('映射甲')!)).toBe(主);
    expect(jar路径(q, '映射甲')).toBe(主);
    fs.mkdirSync(path.dirname(游戏里), { recursive: true });
    fs.writeFileSync(游戏里, 内容);
    expect(jar路径(q, '映射甲')).toBe(游戏里);
    fs.mkdirSync(path.dirname(主), { recursive: true });
    fs.writeFileSync(主, 内容);
    expect(jar路径(q, '映射甲')).toBe(主);
    fs.rmSync(主);
    fs.rmSync(游戏里);
    expect(jar路径(q, '模组乙')).toBe(path.join(临时, '游戏', 'mods', '乙.jar'));
  });
});

describe('anim extract --下载', () => {
  it('不点名只选 根 = 数据、写了下载和 sha256 的；点名能下的以外报错', () => {
    const q = 解析清单('', jars());
    expect([...q.jars.values()].filter(能下载).map((j) => j.id)).toEqual(['映射甲']);
    expect(下载清单(q, [], jar登记路径).map((x) => x.id)).toEqual(['映射甲']);
    expect(() => 下载清单(q, ['模组乙'], jar登记路径)).toThrow(/模组乙 不能自动下/);
    expect(() => 下载清单(q, ['没有'], jar登记路径)).toThrow(/jars.toml 里没有 没有/);
  });

  it('sha 对上才改名落盘；对不上不留文件；已有且对的跳过；已有但不对的不覆盖', () => {
    const 假下 = (写: string) => (_: string, 到: string) => fs.writeFileSync(到, 写);
    const 坏 = 下载清单(解析清单('', jars('f'.repeat(64))), [], jar登记路径);
    const [r坏] = 下载(坏, 假下(内容));
    expect(r坏).toMatchObject({ 状态: '失败', 说明: expect.stringMatching(/下到的 sha256/) });
    expect(fs.readdirSync(path.dirname(r坏!.到))).toEqual([]);

    const 项 = 下载清单(解析清单('', jars()), [], jar登记路径);
    expect(下载(项, 假下(内容))[0]).toMatchObject({ 状态: '下好' });
    expect(fs.readFileSync(项[0]!.到, 'utf8')).toBe(内容);
    expect(下载(项, () => { throw new Error('不该再下'); })[0]).toMatchObject({ 状态: '已有' });

    fs.writeFileSync(项[0]!.到, '被改过');
    expect(下载(项, 假下(内容))[0]).toMatchObject({ 状态: '失败', 说明: expect.stringMatching(/没覆盖/) });
    expect(fs.readFileSync(项[0]!.到, 'utf8')).toBe('被改过');
  });

  it('下载出错（网断）记失败、不留临时文件', () => {
    fs.rmSync(path.join(临时, '数据', 'cache', '映射'), { recursive: true, force: true });
    const 项 = 下载清单(解析清单('', jars()), [], jar登记路径);
    const [r] = 下载(项, (_, 到) => {
      fs.writeFileSync(到, '半截');
      throw new Error('curl: (6) Could not resolve host');
    });
    expect(r).toMatchObject({ 状态: '失败', 说明: expect.stringMatching(/Could not resolve/) });
    expect(fs.readdirSync(path.dirname(项[0]!.到))).toEqual([]);
  });
});
