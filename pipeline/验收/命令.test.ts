// verify 和压缩母版（用户 11-02 定换比法）：哈希和认可版不一样的帧直接解压缩母版，比小块平均颜色，压缩噪声在门槛以下照样过；
// 段签记的母版都没了、又要看像素，报要重渲才能验收，accept 也拒（认可参考要从这版的母版抽）。数据根、作品都是临时的。
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
const 渲的 = vi.hoisted(() => [] as { 键: string[]; 选项: Record<string, unknown> }[]);

vi.mock('../环境/作品.ts', async (原) => ({ ...(await 原<typeof import('../环境/作品.ts')>()), 作品们: () => new Map([['应力转动', 作品根]]), 作品根: () => 作品根 }));
vi.mock('../指纹/指纹.ts', () => ({ 叠层键: (k: string, l: { 名: string }) => `${k}-${l.名}`, 算全部段指纹: async (任务: { 段: { 键: string } }[]) => 任务.map((t) => ({ 段: t.段.键, 指纹: 当前.指纹, 项: {} })) }));
const 段 = { 键: '甲', 段名: '甲', 章: 0, 编号: null, 段: { 帧数: 48, fps: 24, 宽: 320, 高: 180 } };
vi.mock('../清单/清单.ts', async (原) => ({ ...(await 原<typeof import('../清单/清单.ts')>()), 全部段: async () => [段], 选段: async () => [段] }));
vi.mock('../闸/闸.ts', async (原) => ({ ...(await 原<typeof import('../闸/闸.ts')>()), 懒放行闸: () => async () => {}, 过放行闸: <T>(fn: () => Promise<T>) => fn(), 过渲染闸: <T>(fn: () => Promise<T>) => fn() }));
vi.mock('../渲/渲.ts', async (原) => ({
  ...(await 原<typeof import('../渲/渲.ts')>()),
  渲染母版: async (段们: { 键: string }[], _级别: string, 选项: Record<string, unknown>) => (渲的.push({ 键: 段们.map((s) => s.键), 选项 }), []),
}));
// 并排图写到临时数据根，不写主检出的 预览/
vi.mock('../预览/预览.ts', async (原) => ({
  ...(await 原<typeof import('../预览/预览.ts')>()),
  新建预览目录: (主题: string) => fs.mkdtempSync(path.join(process.env.ANIM_DATA!, `预览-${主题}-`)),
}));
vi.mock('./基线.ts', async (原) => ({ ...(await 原<typeof import('./基线.ts')>()), 旧段号: () => '旧', 基线目录: () => process.env.ANIM_DATA! }));
vi.mock('./验收.ts', async (原) => {
  const 真 = await 原<typeof import('./验收.ts')>();
  return { ...真, 扫母版: (f: string, o: never) => (读像素的.push(f), 真.扫母版(f, o)) };
});

const { 验收命令 } = await import('./命令.ts');
const { 扫母版 } = await import('./验收.ts');
const { 原母版路径, 压缩母版路径 } = await import('../渲/母版.ts');
const { 存成压缩 } = await import('../渲/转存.ts');
const { 读认可, 认可文件, 本平台 } = await import('./认可.ts');
const { 参考文件 } = await import('./参考.ts');
const { 读旁记 } = await import('./参考像素.ts');
const { 换算 } = await import('./比较.ts');

const 记录 = () => {
  const 事件: string[] = [];
  return { 记: (_: string, m: string) => 事件.push(m), 产物: [] as string[], 事件 } as unknown as 运行记录 & { 事件: string[] };
};
/** 带颗粒噪声（压缩母版和 CRF1 逐像素差得多，以前按差像素占比比就全不过）；亮一级：整片 Y 加 1，哈希都变、肉眼看不出 */
const 造 = (f: string, 亮一级 = false) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=320x180:rate=24:duration=2,noise=alls=20:allf=t${亮一级 ? ',lutyuv=y=val+1' : ''}`, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'veryfast', '-qp', '0', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ac', '2', f,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
};
const F1 = 指纹('认可那版');
const F2 = 指纹('新的一版');
const 有ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe.skipIf(!有ffmpeg)('verify 和压缩母版', () => {
  beforeAll(async () => {
    fs.mkdirSync(作品根, { recursive: true });
    当前.指纹 = F1;
    造(原母版路径('甲', F1));
    await 验收命令['verify']!.跑(['accept', '甲', '--理由', '测试'], 记录());
    expect(读认可(认可文件('甲'))?.指纹).toBe(F1);
    // 新指纹：同一画面亮一级（噪声种子固定），渲完转存、CRF1 删掉
    当前.指纹 = F2;
    造(原母版路径('甲', F2), true);
    await 存成压缩('甲', F2, '视频');
    fs.rmSync(原母版路径('甲', F2));
  });
  afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

  it('accept 记下换算、从这版的母版备好认可参考（带旁记）', () => {
    const 认 = 读认可(认可文件('甲'))!;
    expect(认.换算).toBe(换算);
    expect(读旁记(参考文件(认, 本平台()))).toMatchObject({ 来源: 'CRF1', 帧: [0, 24, 47] });
  });

  it('只剩压缩母版：哈希不一样的帧解压缩母版比块平均差，压缩噪声在门槛内，过', async () => {
    const 印 = vi.spyOn(console, 'log');
    try {
      expect(await 验收命令['verify']!.跑(['甲'], 记录())).toBe(0);
      const 出 = 印.mock.calls.map((c) => String(c[0])).join('\n');
      expect(出).toMatch(/✓ 甲：和认可版.*比在阈值内（块差，像素取自认可参考；3 帧有微小差别/);
    } finally {
      印.mockRestore();
    }
  });

  it('段签记的母版都没了（CRF1 删了、压缩母版也不在）：要看像素就报要重渲才能验收；accept 也拒', async () => {
    const 压 = 压缩母版路径('甲', F2);
    const 留 = `${压}.留`;
    fs.renameSync(压, 留);
    try {
      读像素的.length = 0;
      const r = 记录();
      expect(await 验收命令['verify']!.跑(['甲'], r)).toBe(1);
      expect(r.事件.join('\n')).toContain('要重渲才能验收');
      expect(读像素的).toEqual([]);
      await expect(验收命令['verify']!.跑(['accept', '甲', '--理由', '测试'], 记录())).rejects.toThrow(/要重渲才能认可/);
    } finally {
      fs.renameSync(留, 压);
    }
  });

  it('--对基线 只剩压缩母版：不比压缩母版，报要加 --渲；加了就重渲并留 CRF1（不是让人 render --重渲 再转存删掉的死路）', async () => {
    读像素的.length = 0;
    渲的.length = 0;
    const r = 记录();
    expect(await 验收命令['verify']!.跑(['--对基线', '甲'], r)).toBe(1);
    expect(r.事件.join('\n')).toContain('anim verify --对基线 --渲 甲');
    expect(渲的).toEqual([]);
    expect(读像素的).toEqual([]);
    expect(await 验收命令['verify']!.跑(['--对基线', '--渲', '甲'], 记录())).toBe(1);
    expect(渲的).toEqual([{ 键: ['甲'], 选项: expect.objectContaining({ 重渲: true, 留CRF1: true }) }]);
    expect(读像素的).toEqual([]);
  });

  it('认可记录的抽样间隔和段签不一样：签名里没有要的帧，解压缩母版重算、都比像素，过', async () => {
    const f = 认可文件('甲');
    const 原文 = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, 原文.replace(/^"间隔" = 24$/m, '"间隔" = 7'));
    expect(fs.readFileSync(f, 'utf8')).not.toBe(原文);
    try {
      读像素的.length = 0;
      expect(await 验收命令['verify']!.跑(['甲'], 记录())).toBe(0);
      expect(读像素的.filter((x) => x.endsWith('.x264.mkv'))).toHaveLength(1);
    } finally {
      fs.writeFileSync(f, 原文);
    }
  });

  it('只剩压缩母版的这版 accept：认可参考从压缩母版抽', async () => {
    await 验收命令['verify']!.跑(['accept', '甲', '--理由', '测试'], 记录());
    const 认 = 读认可(认可文件('甲'))!;
    expect(认.指纹).toBe(F2);
    expect(读旁记(参考文件(认, 本平台()))).toMatchObject({ 来源: '压缩母版' });
  });
});
