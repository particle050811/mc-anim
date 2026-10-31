// verify 永远不拿 CRF12 的像素按 1e-3 门槛比（用户 10-30 定母版存 CRF12，02-实测数据.md：地形差 > 16 占 2.4e-2，比就全不过）：
// 新这一版只用从 CRF1 抽的无损抽样帧；抽样帧丢了报要重渲才能验收，不静默退回。数据根、作品都是临时的。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { 运行记录 } from '../运行记录/记录.ts';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-验收命令-'));
process.env.ANIM_DATA = 数据根;
const 作品根 = path.join(数据根, '假作品');
const 指纹 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const 当前 = vi.hoisted(() => ({ 指纹: '' }));
const 读像素的 = vi.hoisted(() => [] as string[]);

vi.mock('../环境/作品.ts', async (原) => ({ ...(await 原<typeof import('../环境/作品.ts')>()), 作品们: () => new Map([['应力转动', 作品根]]), 作品根: () => 作品根 }));
vi.mock('../指纹/指纹.ts', () => ({ 叠层键: (k: string, l: { 名: string }) => `${k}-${l.名}`, 算全部段指纹: async (任务: { 段: { 键: string } }[]) => 任务.map((t) => ({ 段: t.段.键, 指纹: 当前.指纹, 项: {} })) }));
const 段 = { 键: '甲', 段名: '甲', 章: 0, 编号: null, 段: { 帧数: 48, fps: 24, 宽: 320, 高: 180 } };
vi.mock('../清单/清单.ts', async (原) => ({ ...(await 原<typeof import('../清单/清单.ts')>()), 全部段: async () => [段], 选段: async () => [段] }));
vi.mock('../闸/闸.ts', async (原) => ({ ...(await 原<typeof import('../闸/闸.ts')>()), 懒放行闸: () => async () => {}, 过放行闸: <T>(fn: () => Promise<T>) => fn(), 过渲染闸: <T>(fn: () => Promise<T>) => fn() }));
vi.mock('./验收.ts', async (原) => {
  const 真 = await 原<typeof import('./验收.ts')>();
  return { ...真, 扫母版: (f: string, o: never) => (读像素的.push(f), 真.扫母版(f, o)) };
});

const { 验收命令 } = await import('./命令.ts');
const { 扫母版 } = await import('./验收.ts');
const { 原母版路径, 压缩母版路径 } = await import('../渲/母版.ts');
const { 存成压缩 } = await import('../渲/转存.ts');
const { 读段签, 抽样路径 } = await import('../段签/段签.ts');
const { 读认可, 认可文件 } = await import('./认可.ts');

const 记录 = () => {
  const 事件: string[] = [];
  return { 记: (_: string, m: string) => 事件.push(m), 产物: [] as string[], 事件 } as unknown as 运行记录 & { 事件: string[] };
};
const 造 = (f: string) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  // 噪声大：CRF12 和 CRF1 差 > 16 的像素远超 1e-3，真拿 CRF12 比这里就不过
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=2,noise=alls=80:allf=t', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'veryfast', '-qp', '0', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ac', '2', f,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
};
const F1 = 指纹('认可那版');
const F2 = 指纹('新的一版');
const 有ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe.skipIf(!有ffmpeg)('verify 和 CRF12', () => {
  beforeAll(async () => {
    fs.mkdirSync(作品根, { recursive: true });
    当前.指纹 = F1;
    造(原母版路径('甲', F1));
    await 验收命令['verify']!.跑(['accept', '甲', '--理由', '测试'], 记录());
    expect(读认可(认可文件('甲'))?.指纹).toBe(F1);
    // 新指纹：同一画面（噪声种子固定），渲完转存、CRF1 删掉
    当前.指纹 = F2;
    造(原母版路径('甲', F2));
    await 存成压缩('甲', F2, '视频');
    fs.rmSync(原母版路径('甲', F2));
  });
  afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

  it('只剩 CRF12：用段签的无损抽样帧比，过；真拿 CRF12 比是过不了的', async () => {
    读像素的.length = 0;
    expect(await 验收命令['verify']!.跑(['甲'], 记录())).toBe(0);
    expect(读像素的.filter((f) => f.endsWith('.crf12.mkv'))).toEqual([]);
    const 认 = 读认可(认可文件('甲'))!;
    const 直比 = await 扫母版(压缩母版路径('甲', F2), { 认可: 认, 旧母版: 原母版路径('甲', F1), 阈值: { 差像素门槛: 16, 差像素占比: 1e-3, 块均值容差: 1, 响度容差LU: 0.5, 起音容差帧: 1 } });
    expect(直比.帧结论.some((f) => f.结论 === '变了')).toBe(true);
  });

  it('抽样帧丢了、CRF1 也没了：报要重渲才能验收，不比 CRF12；accept 也拒', async () => {
    const 抽 = 抽样路径(读段签('甲', F2)!);
    const 留 = `${抽}.留`;
    fs.renameSync(抽, 留);
    try {
      读像素的.length = 0;
      const r = 记录();
      expect(await 验收命令['verify']!.跑(['甲'], r)).toBe(1);
      expect(r.事件.join('\n')).toContain('要重渲才能验收');
      expect(读像素的).toEqual([]);
      await expect(验收命令['verify']!.跑(['accept', '甲', '--理由', '测试'], 记录())).rejects.toThrow(/要重渲才能认可/);
    } finally {
      fs.renameSync(留, 抽);
    }
  });

  it('认可记录的抽样间隔和段签不一样、CRF1 没了：同样报要重渲，不比 CRF12', async () => {
    const f = 认可文件('甲');
    const 原文 = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, 原文.replace(/^"间隔" = 24$/m, '"间隔" = 7'));
    expect(fs.readFileSync(f, 'utf8')).not.toBe(原文);
    try {
      读像素的.length = 0;
      const r = 记录();
      expect(await 验收命令['verify']!.跑(['甲'], r)).toBe(1);
      expect(读像素的.filter((x) => x.endsWith('.crf12.mkv'))).toEqual([]);
    } finally {
      fs.writeFileSync(f, 原文);
    }
  });
});
