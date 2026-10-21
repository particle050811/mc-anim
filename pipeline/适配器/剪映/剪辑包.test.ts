// 剪辑包：交付 manifest → 段落、台词行；段.ts cue → 音效清单；再用合成的小素材跑一遍 剪辑包.py、导入剪映.py、读取调整.py
// （去台词减得干净、台词落点 0 样本、写进临时草稿目录再读回没挪过）。缺 uv 或 ffmpeg 时跳过后半。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { 段信息 } from '../../清单/清单.ts';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-剪辑包测试-'));
process.env.SR_DATA = 数据根;
process.env.SR_JIANYING_DRAFTS = path.join(数据根, '草稿');

const { 段落表, 台词行, 找交付目录, uv带numpy, py环境 } = await import('./剪辑包.ts');
const { 段的清单 } = await import('./音效清单.ts');
const { 导入剪映, 读回调整, 找包 } = await import('./剪映.ts');
const { 跑 } = await import('../../环境/子进程.ts');

const 有工具 = spawnSync('uv', ['--version']).status === 0 && spawnSync('ffmpeg', ['-version']).status === 0;

const m = {
  名: '测',
  帧率: 24,
  宽: 1280,
  高: 720,
  总帧数: 144,
  响度: { 增益dB: 2 },
  段: [
    { 编号: '1-01', 键: '1-甲', 指纹: 'a', 母版: '/m/a.mkv', 帧数: 100, 全片起帧: 0 },
    { 编号: null, 键: '1-乙', 指纹: 'b', 母版: '/m/b.mkv', 帧数: 44, 全片起帧: 100 },
  ],
  叠层: [],
  文件: { 成片: '测.mp4', 拼接表: '拼接表.tsv' },
};

describe('剪辑包', () => {
  it('段落用编号（没有用段键），台词起帧是文件头、段尾是那段的全片止帧', () => {
    expect(段落表(m)).toEqual([
      { 段: '1-01', Composition: '1-甲', 全片起帧: 0, 段内起帧: 0, 帧数: 100 },
      { 段: '1-乙', Composition: '1-乙', 全片起帧: 100, 段内起帧: 0, 帧数: 44 },
    ]);
    const 落点 = { id: '1-甲-说', 段: '1-乙', 段内帧: 4, 文件头帧: 103.28, 文件: '', 配音: '配音/1-甲-说', 字: '说', 角色: '甲', 位置: '下' as const, 屏们: [] };
    expect(台词行(m, [落点], (id) => `/库/${id}`)).toEqual([{ id: '1-甲-说', 段: '1-乙', 字: '说', 角色: '甲', 文件: '/库/配音/1-甲-说', 起帧: 103.28, 段尾: 144 }]);
    expect(() => 台词行(m, [{ ...落点, 段: '1-丙' }], (x) => x)).toThrow(/不在 manifest/);
  });

  it('cue → 清单：配乐/ 开头的进配乐清单，其余音效；截到段尾；台词按开口往前推文件头，段开头之前的从文件里跳过', () => {
    const s = { 键: '1-甲', 段: { 帧数: 50, fps: 24, 声音: [{ 帧: 0, 资产: '配乐/曲' }, { 帧: 40, 资产: '音效/钟' }, { 帧: 2, 台词: '1-甲-说' }] } } as unknown as 段信息;
    const r = 段的清单(s, (id) => path.join(数据根, 'store', id), () => 30, new Map([['1-甲-说', '配音/1-甲-说']]), new Map([['1-甲-说', 0.25]]));
    expect(r.配乐清单.map((c) => [c.名, c.文件, c.起帧, c.帧数, c.入点秒])).toEqual([['曲', path.join('store', '配乐', '曲'), 0, 30, 0]]);
    expect(r.音效清单.map((c) => [c.起帧, c.帧数, c.增益.length])).toEqual([[40, 10, 10]]);
    // 开口 0.25 秒 = 6 帧，文件头在段内第 −4 帧：从第 0 帧放、跳过文件头 4 帧
    expect(r.台词清单.map((c) => [c.名, c.起帧, c.入点秒, c.帧数])).toEqual([['1-甲-说', 0, 4 / 24, 26]]);
  });

  it('交付目录给名字或路径都行，剪映命令也认交付目录', () => {
    const dir = path.join(数据根, '交付', '1021-0000-测');
    fs.mkdirSync(path.join(dir, '剪辑包'), { recursive: true });
    expect(() => 找交付目录('1021-0000-测')).toThrow(/没有 manifest.json/);
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{}');
    expect(找交付目录('1021-0000-测')).toBe(dir);
    expect(() => 找包(dir)).toThrow(/不是剪辑包/);
    fs.writeFileSync(path.join(dir, '剪辑包', '清单.json'), '{}');
    expect(找包('1021-0000-测')).toBe(path.join(dir, '剪辑包'));
  });

  it.skipIf(!有工具)('剪辑包.py → 导入剪映.py → 读取调整.py：去台词减得干净、落点 0 样本，草稿读回没挪过', async () => {
    const 包 = path.join(数据根, '包');
    const 素材 = path.join(数据根, '素材');
    fs.mkdirSync(包, { recursive: true });
    fs.mkdirSync(素材, { recursive: true });
    const ff = (...a: string[]) => {
      const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...a]);
      if (r.status !== 0) throw new Error(String(r.stderr));
    };
    // 台词 1 秒、文件头放在第 30.5 帧（落在样本 61000）；底下一条 6 秒的正弦当配乐
    ff('-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=1', '-af', 'volume=0.5', '-c:a', 'pcm_f32le', path.join(素材, '台词.wav'));
    ff('-f', 'lavfi', '-i', 'sine=frequency=110:sample_rate=48000:duration=6', '-af', 'volume=0.2', '-ac', '2', '-c:a', 'pcm_f32le', path.join(素材, '底.wav'));
    const 未拉 = path.join(素材, '未拉.wav');
    ff('-i', path.join(素材, '底.wav'), '-i', path.join(素材, '台词.wav'), '-filter_complex', '[1:a]adelay=61000S:all=1,pan=stereo|c0=c0|c1=c0[d];[0:a][d]amix=inputs=2:normalize=0:duration=first', '-c:a', 'pcm_f32le', 未拉);
    const 参照 = path.join(素材, '参照.wav');
    ff('-i', 未拉, '-af', 'volume=2dB', '-c:a', 'pcm_f32le', 参照);
    ff('-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-frames:v', '144', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(包, '画面.mp4'));
    const 输入 = {
      包目录: 包,
      项目名: '剪辑包测试',
      帧率: 24,
      总帧: 144,
      增益dB: 2,
      画面: '画面.mp4',
      未拉响度: 未拉,
      参照,
      段落: [{ 段: '1-01', Composition: '1-甲', 全片起帧: 0, 段内起帧: 0, 帧数: 144 }],
      台词: [{ id: '1-甲-说', 段: '1-01', 字: '测试一句', 角色: '甲', 文件: path.join(素材, '台词.wav'), 起帧: 30.5, 段尾: 144 }],
      字幕屏: [{ 句: '1-甲-说', 字: '测试一句', 起帧: 27, 止帧: 64, 位置: '下', 依据: '开口' }],
      清单目录: null,
      文件根: null,
      来源: { 交付: 数据根 },
    };
    const 输入文件 = path.join(数据根, '输入.json');
    fs.writeFileSync(输入文件, JSON.stringify(输入));
    await 跑(uv带numpy('剪辑包.py', [输入文件]), { env: py环境(), 安静: true });

    const 清单 = JSON.parse(fs.readFileSync(path.join(包, '清单.json'), 'utf8'));
    expect(清单.轨道.map((t: { 名: string }) => t.名)).toEqual(['字幕', '画面', 'AI 配音', '配乐和音效', '我的口播']);
    const 配音 = 清单.轨道[2].片段[0];
    expect([配音.起帧, 配音.元数据.预乘增益dB]).toEqual([30.5, 2]);
    expect(清单.轨道[0].片段[0].跟随).toBe(配音.名);
    expect(fs.readFileSync(path.join(包, '核对.tsv'), 'utf8')).toContain('1-甲-说\t0\t+0.00');
    // 去台词 = 底 × 增益（24 位 PCM 的量化以内）
    const 读 = (f: string) => new Float32Array(spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'f32le', '-ac', '1', '-'], { maxBuffer: 1 << 28 }).stdout.buffer.slice(0));
    const 去 = 读(path.join(包, '去台词.wav'));
    const 底 = 读(path.join(素材, '底.wav'));
    let 差 = 0;
    for (let i = 0; i < 去.length; i++) 差 = Math.max(差, Math.abs(去[i]! - 底[i]! * 10 ** (2 / 20)));
    expect(差).toBeLessThan(1e-4);

    await 导入剪映(包);
    const 草稿 = path.join(process.env.SR_JIANYING_DRAFTS!, '剪辑包测试');
    const info = JSON.parse(fs.readFileSync(path.join(草稿, 'draft_info.json'), 'utf8'));
    expect(info.tracks.map((t: { name: string }) => t.name)).toEqual(['画面', '字幕', 'AI 配音', '配乐和音效']);
    expect(info.group_container.groups).toHaveLength(1);
    await 读回调整(包, false);
    const 调整 = fs.readdirSync(包).find((f) => /^调整-.*\d\.json$/.test(f))!;
    const 片段 = JSON.parse(fs.readFileSync(path.join(包, 调整), 'utf8')).片段 as { 名: string; 文件开头帧: number }[];
    expect(片段.find((c) => c.名 === 配音.名)!.文件开头帧).toBe(30.5);
    expect(fs.readFileSync(path.join(包, 调整.replace('.json', '-对比.tsv')), 'utf8')).toContain('30.50\t30.50\t+0.00');
  }, 120_000);
});
