// verify 和切片（用户 11-02 定换比法，11-06 定只比切片）：哈希和认可版不一样的帧直接解切片，比小块平均颜色，编码噪声在门槛以下照样过；
// 段签记的切片没了、又要看像素，报要重渲才能验收，accept 也拒（认可参考要从这版的切片抽）；CRF1 时代的认可（尺寸、帧数对不上）报要重新认可。
// 数据根、作品都是临时的；渲染换成假的（记下要渲哪几段）。
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
const 渲的 = vi.hoisted(() => [] as string[][]);

vi.mock('../环境/作品.ts', async (原) => ({ ...(await 原<typeof import('../环境/作品.ts')>()), 作品们: () => new Map([['应力转动', 作品根]]), 作品根: () => 作品根 }));
const 段 = { 键: '甲', 段名: '甲', 章: 0, 编号: null, 段: { 帧数: 48, fps: 24, 宽: 320, 高: 180 } };
vi.mock('../清单/清单.ts', async (原) => ({ ...(await 原<typeof import('../清单/清单.ts')>()), 全部段: async () => [段], 选段: async () => [段] }));
vi.mock('../闸/闸.ts', async (原) => ({ ...(await 原<typeof import('../闸/闸.ts')>()), 懒放行闸: () => async () => {}, 过放行闸: <T>(fn: () => Promise<T>) => fn(), 过渲染闸: <T>(fn: () => Promise<T>) => fn() }));
// 切片的路径、指纹照真的算法起名，指纹由 当前.指纹 定；测试的切片是 320×180 48 帧
vi.mock('../渲/段产物.ts', async (原) => {
  const 真 = await 原<typeof import('../渲/段产物.ts')>();
  return {
    ...真,
    段产物们: async (_全部: unknown, 段们: { 键: string }[]) =>
      段们.map((s) => {
        const 声 = 指纹(`${当前.指纹}-声`);
        return { 段: s, 画面指纹: { 段: s.键, 指纹: 当前.指纹, 项: {} }, 声音指纹: { 段: s.键, 指纹: 声, 项: {} }, 画面: 真.段画面路径(s.键, 当前.指纹), 声音: 真.段声音路径(s.键, 声), 输出帧数: 48, 输出起帧: 0, 参数: { inputProps: { 级别: '视频' } } };
      }),
  };
});
vi.mock('../渲/设置.ts', async (原) => ({ ...(await 原<typeof import('../渲/设置.ts')>()), 母版宽高: () => [320, 180] }));
vi.mock('../渲/渲段.ts', () => ({ 渲染段们: async (_全部: unknown, 段们: { 键: string }[]) => (渲的.push(段们.map((s) => s.键)), []) }));
// 并排图写到临时数据根，不写主检出的 预览/
vi.mock('../预览/预览.ts', async (原) => ({
  ...(await 原<typeof import('../预览/预览.ts')>()),
  新建预览目录: (主题: string) => fs.mkdtempSync(path.join(process.env.ANIM_DATA!, `预览-${主题}-`)),
}));
vi.mock('./验收.ts', async (原) => {
  const 真 = await 原<typeof import('./验收.ts')>();
  return { ...真, 扫母版: (f: string, o: never) => (读像素的.push(f), 真.扫母版(f, o)) };
});

const { 验收命令 } = await import('./命令.ts');
const { 段画面路径, 段声音路径 } = await import('../渲/段产物.ts');
const { 读认可, 认可文件, 本平台 } = await import('./认可.ts');
const { 参考文件 } = await import('./参考.ts');
const { 读旁记 } = await import('./参考像素.ts');
const { 换算 } = await import('./比较.ts');

const 记录 = () => {
  const 事件: string[] = [];
  return { 记: (_: string, m: string) => 事件.push(m), 产物: [] as string[], 事件 } as unknown as 运行记录 & { 事件: string[] };
};
/** 一份切片（mp4 不带声音）和配的 wav；带颗粒噪声，亮一级：整片 Y 加 1，哈希都变、肉眼看不出 */
const 造 = (指: string, 亮一级 = false) => {
  const 画 = 段画面路径('甲', 指);
  fs.mkdirSync(path.dirname(画), { recursive: true });
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=320x180:rate=24:duration=2,noise=alls=20:allf=t${亮一级 ? ',lutyuv=y=val+1' : ''}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-qp', '0', '-threads', '1', '-pix_fmt', 'yuv420p', '-an', 画,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  const 声 = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2:sample_rate=48000', '-c:a', 'pcm_s16le', '-ac', '2', 段声音路径('甲', 指纹(`${指}-声`))]);
  if (声.status !== 0) throw new Error(String(声.stderr));
};
const F1 = 指纹('认可那版');
const F2 = 指纹('新的一版');
const 有ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const 跑 = (args: string[], r = 记录()) => 验收命令['verify']!.跑(args, r);

describe.skipIf(!有ffmpeg)('verify 和切片', () => {
  beforeAll(async () => {
    fs.mkdirSync(作品根, { recursive: true });
    当前.指纹 = F1;
    造(F1);
    await 跑(['accept', '甲', '--理由', '测试']);
    expect(读认可(认可文件('甲'))?.指纹).toBe(F1);
    // 新指纹：同一画面亮一级（噪声种子固定）
    当前.指纹 = F2;
    造(F2, true);
  });
  afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

  it('accept 记下换算、从这版的切片备好认可参考（带旁记）', () => {
    const 认 = 读认可(认可文件('甲'))!;
    expect(认.换算).toBe(换算);
    expect(读旁记(参考文件(认, 本平台()))).toMatchObject({ 来源: '切片', 帧: [0, 24, 47] });
  });

  it('哈希不一样的帧解切片比块平均差，编码噪声在门槛内，过', async () => {
    const 印 = vi.spyOn(console, 'log');
    try {
      expect(await 跑(['甲'])).toBe(0);
      const 出 = 印.mock.calls.map((c) => String(c[0])).join('\n');
      expect(出).toMatch(/✓ 甲：和认可版.*比在阈值内（块差，像素取自认可参考；3 帧有微小差别/);
    } finally {
      印.mockRestore();
    }
  });

  it('段签记的切片没了：要看像素就报要重渲才能验收；accept 也拒；--渲 就把它交给渲段', async () => {
    const 画 = 段画面路径('甲', F2);
    const 留 = `${画}.留`;
    fs.renameSync(画, 留);
    try {
      读像素的.length = 0;
      渲的.length = 0;
      const r = 记录();
      expect(await 跑(['甲'], r)).toBe(1);
      expect(r.事件.join('\n')).toContain('要重渲才能验收（anim film 甲 --重渲）');
      expect(读像素的).toEqual([]);
      await expect(跑(['accept', '甲', '--理由', '测试'])).rejects.toThrow(/先 anim film 甲/);
      expect(渲的).toEqual([]);
      await 跑(['--渲', '甲']);
      expect(渲的).toEqual([['甲']]);
    } finally {
      fs.renameSync(留, 画);
    }
  });

  it('不是现行的认可（CRF1 时代的 1440p）：报要重新认可，不解码', async () => {
    const f = 认可文件('甲');
    const 原文 = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, 原文.replace(/^"宽" = 320$/m, '"宽" = 2560').replace(/^"高" = 180$/m, '"高" = 1440'));
    expect(fs.readFileSync(f, 'utf8')).not.toBe(原文);
    try {
      读像素的.length = 0;
      const r = 记录();
      expect(await 跑(['甲'], r)).toBe(1);
      expect(r.事件.join('\n')).toMatch(/甲：这段没有现行认可，要重新认可（认可时是 2560×1440 48 帧，现在的切片是 320×180 48 帧/);
      expect(读像素的).toEqual([]);
    } finally {
      fs.writeFileSync(f, 原文);
    }
  });

  it('认可记录的抽样间隔和段签不一样：签名里没有要的帧，解切片重算、都比像素，过', async () => {
    const f = 认可文件('甲');
    const 原文 = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, 原文.replace(/^"间隔" = 24$/m, '"间隔" = 7'));
    expect(fs.readFileSync(f, 'utf8')).not.toBe(原文);
    try {
      读像素的.length = 0;
      expect(await 跑(['甲'])).toBe(0);
      expect(读像素的.filter((x) => x.endsWith('.mp4'))).toHaveLength(1);
    } finally {
      fs.writeFileSync(f, 原文);
    }
  });

  it('这版 accept：认可参考从这版的切片抽', async () => {
    await 跑(['accept', '甲', '--理由', '测试']);
    const 认 = 读认可(认可文件('甲'))!;
    expect(认.指纹).toBe(F2);
    expect(读旁记(参考文件(认, 本平台()))).toMatchObject({ 来源: '切片' });
  });
});
