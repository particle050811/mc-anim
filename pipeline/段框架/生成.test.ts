// anim cues 的生成和核对：临时目录里放一个窗口段（@engine 按真的代码根解析），数用假的、不量音频。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SegmentDef } from '../../engine/段/段定义.ts';
import type { AssetLock } from '../资产/资产锁.ts';
import { codeRoot } from '../环境/路径.ts';
import { soundUrlFile, soundTableFile, freshExec, checkSeg, generateSeg, type GenerateEnv } from './生成.ts';

const assetLock: AssetLock = {
  '音效/门': { sha256: 'a'.repeat(64), 大小: 1, 库: 'store', 后缀: '.ogg' },
  '配音/甲': { sha256: 'b'.repeat(64), 大小: 1, 库: 'store', 后缀: '.wav' },
  '配乐/私': { sha256: 'c'.repeat(64), 大小: 1, 库: '私有', 后缀: '.wav' },
};
const assetSpecs = { '音效/门': { 时长: 1, 峰值: -6 }, '配音/甲': { 时长: 2, 峰值: -3 }, '配乐/私': { 时长: 60, 峰值: -1, 响度: -14 } } as const;

let segDir: string;
let measuredIds: string[];
const makeEnv = (o: Partial<GenerateEnv> = {}): GenerateEnv => ({
  assetLock,
  lineTable: [{ id: '甲', 配音: '配音/甲', 开口: 0.5 }],
  getMeasure: (id) => {
    measuredIds.push(id);
    return assetSpecs[id as keyof typeof assetSpecs];
  },
  ...o,
});
const writeSeg = (soundsCode: string) =>
  fs.writeFileSync(
    path.join(segDir, '段.ts'),
    `import { 定义场时间线, 窗口段 } from '@engine/段/窗口段.ts';
import 声音表 from './声音表.生成.ts';
const 线 = 定义场时间线({ 场: '核对', 事件: { 起: { 在: { 秒: 0 } }, 响: { 在: { 秒: 0.5 } }, 止: { 在: { 秒: 2 } } } });
export default 窗口段(线, { 起: '起', 止: '止', 声音表, 声音: ({ 放, 说, 接着说, 事件 }) => [${soundsCode}] });
`,
  );
const root = codeRoot();

beforeEach(() => {
  segDir = fs.mkdtempSync(path.join(os.tmpdir(), '段框架-生成-'));
  measuredIds = [];
});
afterEach(() => fs.rmSync(segDir, { recursive: true, force: true }));

describe('生成一段', () => {
  it('没有声音表也能起步：收集用到的声音、写两份文件；再跑一次不改', async () => {
    writeSeg(`放('音效/门', 事件.响, -12), 说('甲', 事件.响), 放('配乐/私', 0, { 响度: -20, 名: '歌' })`);
    const r = await generateSeg(path.join(segDir, '段.ts'), root, makeEnv());
    expect(r.changed).toEqual([soundTableFile, soundUrlFile]);
    expect(r.段.声音).toEqual([
      { 秒: 0.5, 资产: '音效/门', 名: '门', 长秒: 1, 增益: 0.501187 },
      { 秒: 0.5, 台词: '甲' },
      { 秒: 0, 资产: '配乐/私', 名: '歌', 长秒: 2, 增益: 0.501187 },
    ]);
    expect(r.表.台词).toEqual({ lineA: { 配音: '配音/甲', 开口: 0.5, 时长: 2 } });
    const source = fs.readFileSync(path.join(segDir, soundUrlFile), 'utf8');
    expect(source).toContain(`import 声0 from "asset:配音/甲";`);
    expect(source).toContain(`"配乐/私": 私有配乐("配乐/私")`);
    expect(source).not.toContain('asset:配乐/私');
    const soundTable = (await freshExec(path.join(segDir, soundTableFile), root)).default;
    expect(soundTable).toEqual(r.表);
    const rerun = await generateSeg(path.join(segDir, '段.ts'), root, makeEnv());
    expect(rerun.changed).toEqual([]);
  });

  it('核对：cue 对得上返回空；加一声报出来；锁里、缓存里没数的沿用盘上的，没有就报', async () => {
    writeSeg(`放('音效/门', 事件.响, -12)`);
    await generateSeg(path.join(segDir, '段.ts'), root, makeEnv());
    const seg = (await freshExec(path.join(segDir, '段.ts'), root)).default as SegmentDef;
    const noMeasure = { ...makeEnv(), getMeasure: () => undefined };
    expect(await checkSeg(seg, segDir, root, noMeasure)).toEqual([]);
    const withAdded = { ...seg, 声音: [...(seg.声音 ?? []), { 秒: 0, 资产: '配乐/私', 名: '歌', 长秒: 0.4 }] } as SegmentDef;
    expect((await checkSeg(withAdded, segDir, root, noMeasure)).join('\n')).toMatch(/声音表里没有「配乐\/私」/);
    const issues = await checkSeg(withAdded, segDir, root, { ...noMeasure, getMeasure: (id: string) => assetSpecs[id as keyof typeof assetSpecs] });
    expect(issues.map((x) => x.split(' ')[0])).toEqual([soundTableFile, soundUrlFile]);
    fs.rmSync(path.join(segDir, soundUrlFile));
    expect(await checkSeg(seg, segDir, root, noMeasure)).toEqual([`缺 ${soundTableFile} 或 ${soundUrlFile}：跑 anim cues`]);
  });

  it('声音表记 sha：换机器重跑沿用盘上 sha 对得上的数、不重量；字节换了（同 id 新 sha）核对报、重跑重量', async () => {
    writeSeg(`放('音效/门', 事件.响, -12)`);
    const r = await generateSeg(path.join(segDir, '段.ts'), root, makeEnv());
    expect(r.表.资产['音效/门']).toEqual({ 时长: 1, 峰值: -6, sha: 'a'.repeat(12) });
    measuredIds = [];
    await generateSeg(path.join(segDir, '段.ts'), root, makeEnv({ getMeasure: () => ({ 时长: 1.01, 峰值: -6.01 }) }));
    expect((await freshExec(path.join(segDir, soundTableFile), root)).default).toEqual(r.表);
    const seg = (await freshExec(path.join(segDir, '段.ts'), root)).default as SegmentDef;
    const newLock = { ...assetLock, '音效/门': { ...assetLock['音效/门']!, sha256: 'd'.repeat(64) } };
    const noMeasure = { ...makeEnv(), assetLock: newLock, getMeasure: () => undefined };
    expect((await checkSeg(seg, segDir, root, noMeasure)).join('\n')).toMatch(/「音效\/门」的字节换了（锁里 sha d{12}，声音表里 a{12}）/);
    const rerun = await generateSeg(path.join(segDir, '段.ts'), root, makeEnv({ assetLock: newLock, getMeasure: () => ({ 时长: 3, 峰值: -6 }) }));
    expect(rerun.表.资产['音效/门']).toEqual({ 时长: 3, 峰值: -6, sha: 'd'.repeat(12) });
    expect(rerun.段.声音?.[0]).toMatchObject({ 长秒: 1.5 });
  });

  it('场声音：生成时收进表和地址表；一定不沾边的不进表；要过数但没落进窗口的留在表里，再跑不来回翻', async () => {
    const writeSceneSeg = (doorSec: number) =>
      fs.writeFileSync(
        path.join(segDir, '段.ts'),
        `import { 定义场时间线, 窗口段 } from '@engine/段/窗口段.ts';
import 声音表 from './声音表.生成.ts';
const 线 = 定义场时间线({
  场: '核对',
  事件: { 起: { 在: { 秒: 0 } }, 切: { 在: { 秒: 2 } }, 止: { 在: { 秒: 4 } } },
  声音: [{ 资产: '音效/门', 在: { 秒: ${doorSec} }, 峰值: -12 }, { 资产: '配乐/私', 在: { 秒: 3 }, 增益: 0.5 }],
});
export default 窗口段(线, { 起: '切', 止: { 长秒: 1 }, 声音表 });
`,
      );
    // 窗口 [2, 3) 秒：门 从 1.5 秒起放 1 秒，剩 0.5 秒落进来；私 从 3 秒起，一定不沾边
    writeSceneSeg(1.5);
    const r = await generateSeg(path.join(segDir, '段.ts'), root, makeEnv());
    expect(r.段.声音).toEqual([{ 秒: 0, 资产: '音效/门', 名: '门', 长秒: 0.5, 入点秒: 0.5, 增益: 0.501187 }]);
    expect(Object.keys(r.表.资产)).toEqual(['音效/门']);
    expect(fs.readFileSync(path.join(segDir, soundUrlFile), 'utf8')).toContain('asset:音效/门');
    // 门 改在第 0 秒：起在窗口前、要过数才知道放多长，放完（1 秒）也没到窗口：留在表里，地址表里没有它；再跑一次不改
    writeSceneSeg(0);
    const generated = await generateSeg(path.join(segDir, '段.ts'), root, makeEnv());
    expect([generated.段.声音, Object.keys(generated.表.资产)]).toEqual([undefined, ['音效/门']]);
    expect(fs.readFileSync(path.join(segDir, soundUrlFile), 'utf8')).not.toContain('asset:');
    expect((await generateSeg(path.join(segDir, '段.ts'), root, makeEnv())).changed).toEqual([]);
    const seg = (await freshExec(path.join(segDir, '段.ts'), root)).default as SegmentDef;
    expect(await checkSeg(seg, segDir, root, { ...makeEnv(), getMeasure: () => undefined })).toEqual([]);
  });

  it('不是窗口段做的段：报错，起步时写的空表删掉', async () => {
    fs.writeFileSync(path.join(segDir, '段.ts'), `export default { 场: '核对', 秒: 1, 宽: 1, 高: 1, 地形: [] };\n`);
    await expect(generateSeg(path.join(segDir, '段.ts'), root, makeEnv())).rejects.toThrow(/不是段框架的段/);
    expect(fs.existsSync(path.join(segDir, soundTableFile))).toBe(false);
  });

  it('目录里已有声音表、一声也没有的 定义段：照样生成（第 6、7 章没声音的段）', async () => {
    fs.writeFileSync(path.join(segDir, '段.ts'), `export default { 场: '核对', 秒: 1, 宽: 1, 高: 1, 地形: [] };\n`);
    fs.writeFileSync(path.join(segDir, soundTableFile), 'export default { 资产: {}, 台词: {} };\n');
    await expect(generateSeg(path.join(segDir, '段.ts'), root, makeEnv())).resolves.toBeDefined();
    expect(fs.existsSync(path.join(segDir, soundUrlFile))).toBe(true);
  });

  it('跨段的接上段：从上一段算 上段开口秒；没有上一段就报错', async () => {
    writeSeg(`接着说('甲', 0)`);
    const prevSeg: SegmentDef = { 秒: 2, 声音: [{ 秒: 1.75, 台词: '甲' }] } as unknown as SegmentDef;
    const r = await generateSeg(path.join(segDir, '段.ts'), root, makeEnv({ prevSeg: async () => prevSeg }));
    expect(r.表.台词.甲).toEqual({ 配音: '配音/甲', 开口: 0.5, 时长: 2, prevSegOpenSec: -0.25 });
    fs.rmSync(path.join(segDir, soundTableFile));
    await expect(generateSeg(path.join(segDir, '段.ts'), root, makeEnv())).rejects.toThrow(/接上段/);
  });
});
