// 字幕表生成：断屏和排时间对旧项目基线（数据根 基线/<作品>/_表/ 的 台词落点.json、拼接表.tsv、字幕表.tsv、字幕.srt）；
// 配音从资产库取（旧台词 id 换新 id 查 作品/应力转动/旧名.tsv）。数据根不全时跳过基线那几条，合成的小例子照跑。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { 数据路径, 基线根 } from '../环境/配置.ts';
import { 代码根 } from '../环境/路径.ts';
import { 读资产锁 } from '../资产/资产锁.ts';
import { 有声段, 排字幕, 字幕表tsv, srt, 核对开口, type 台词落点 } from './字幕.ts';
import { 断屏, 画字幕卡 } from './字幕卡.ts';
import { 读单声道 } from './音频.ts';

const 表目录 = path.join(基线根(), '_表');
const 锁 = 读资产锁();
const 有库 = (id: string) => !!锁[id] && fs.existsSync(数据路径(锁[id]!.库, 锁[id]!.sha256.slice(0, 2), 锁[id]!.sha256));
const 有基线 = fs.existsSync(path.join(表目录, '台词落点.json')) && 有库('字体/像素字');
const 有ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

type 旧落点 = { id: string; 段: string; 起帧: number; 字: string; 角色: string; 位置: '下' | '思索上'; 屏们: unknown[]; 接上段: boolean };

const 新台词id = () => {
  const m = new Map<string, string>();
  for (const line of fs.readFileSync(path.join(代码根(), '作品', '应力转动', '旧名.tsv'), 'utf8').split('\n')) {
    const [类, 旧, 新] = line.split('\t');
    if (类 === '台词' && 旧 && 新) m.set(旧, 新);
  }
  return m;
};
// 6-3-2 思索里念的那句不走台词轨，配音是镜头自己的
const 配音资产 = (旧id: string, 映射: Map<string, string>) => (旧id === '6-3-2-李樱-压路机' ? '配音/镜头/6-3-2/李樱-压路机-改字' : `配音/${映射.get(旧id)}`);
const 资产文件 = (id: string) => 数据路径(锁[id]!.库, 锁[id]!.sha256.slice(0, 2), 锁[id]!.sha256);

const 读基线 = () => {
  const 落点们 = (JSON.parse(fs.readFileSync(path.join(表目录, '台词落点.json'), 'utf8')) as 旧落点[]).filter((a) => !a.接上段);
  const 拼接 = fs.readFileSync(path.join(表目录, '拼接表.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t'));
  const 起 = new Map(拼接.map((r) => [r[0]!, Number(r[4])]));
  const 总帧数 = 拼接.reduce((a, r) => a + Number(r[3]) - Number(r[2]), 0);
  return { 落点们, 起, 总帧数 };
};

describe('字幕', () => {
  it('有声段：两截声音中间停 0.3 秒，算成两段；停不到 0.1 秒的并成一段', () => {
    const x = new Float32Array(48000 * 2);
    const 响 = (a: number, b: number) => {
      for (let i = Math.round(a * 48000); i < Math.round(b * 48000); i++) x[i] = 0.3 * Math.sin(i / 7);
    };
    响(0.1, 0.6);
    响(0.9, 1.2);
    响(1.25, 1.5);
    expect(有声段(x)).toEqual([
      [0.1, 0.6],
      [0.9, 1.5],
    ]);
  });

  it.skipIf(!有基线)('断屏：和旧项目 台词落点.json 的 屏们 一样', () => {
    for (const a of 读基线().落点们) expect(断屏(a.字), a.id).toEqual(a.屏们);
  });

  it.skipIf(!有基线 || !有ffmpeg)('排时间：落点按基线算，字幕表、SRT 和旧项目的一样（起止帧差不超过 1 帧）', () => {
    const { 落点们, 起, 总帧数 } = 读基线();
    const 映射 = 新台词id();
    const 台词表 = JSON.parse(fs.readFileSync(资产文件('数据/配音/台词表'), 'utf8')) as Record<string, { 开口: number }>;
    const 输入: 台词落点[] = 落点们.map((a) => {
      // 新的 cue 帧是开口落在段内哪一帧（整数）；基线的 起帧 是文件头
      const 开口 = 台词表[a.id]?.开口 ?? 0;
      const cue帧 = Math.round(a.起帧 + 开口 * 24);
      return { id: a.id, 段: a.段, 段内帧: cue帧, 文件头帧: 起.get(a.段)! + cue帧 - 开口 * 24, 文件: 资产文件(配音资产(a.id, 映射)), 配音: 配音资产(a.id, 映射), 字: a.字, 角色: a.角色, 位置: a.位置, 屏们: 断屏(a.字) };
    });
    const 声音 = new Map<string, Float32Array>();
    const 读 = (f: string) => 声音.get(f) ?? 声音.set(f, 读单声道(f)).get(f)!;
    const { 屏们 } = 排字幕(输入, 总帧数, 24, 读);
    // 旧表末尾的「接着放的后半截」行只是核对用，新管线不再记（cue 只在开口那段）
    const 旧表 = fs.readFileSync(path.join(表目录, '字幕表.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t')).filter((r) => r[4]);
    const 新表 = 字幕表tsv(屏们, 24).trim().split('\n').slice(1).map((l) => l.split('\t'));
    expect(新表.length).toBe(旧表.length);
    let 一样 = 0;
    新表.forEach((r, i) => {
      const o = 旧表[i]!;
      expect(r.slice(0, 4), `第 ${i + 1} 屏`).toEqual(o.slice(0, 4));
      expect(Math.abs(Number(r[4]) - Number(o[4])), `${r[3]} 起帧`).toBeLessThanOrEqual(1);
      expect(Math.abs(Number(r[5]) - Number(o[5])), `${r[3]} 止帧`).toBeLessThanOrEqual(1);
      if (r[4] === o[4] && r[5] === o[5]) 一样++;
    });
    console.log(`字幕表：${新表.length} 屏里起止帧和基线完全一样的 ${一样} 屏`);
    // 只有基线里落点不是整数帧的几句（6-1-9b、6-4-5、6-4-6）可能差 1 帧
    expect(一样).toBeGreaterThanOrEqual(新表.length - 8);
    const 旧srt = fs.readFileSync(path.join(表目录, '字幕.srt'), 'utf8');
    expect(srt(屏们, 24).split('\n\n').length).toBe(旧srt.split('\n\n').length);
  }, 120_000);

  it.skipIf(!有ffmpeg)('核对开口：配音塞进一段混音里，量出的开口帧和落点差不到 0.1 帧', () => {
    const 语 = new Float32Array(48000);
    for (let i = 4800; i < 40000; i++) 语[i] = 0.4 * Math.sin(i / 5) * Math.sin(i / 3000);
    const 混 = new Float32Array(48000 * 6);
    const 头 = 48000 * 2 + 1000; // 文件头放在第 2 秒多一点
    混.set(语, 头);
    for (let i = 0; i < 混.length; i++) 混[i]! += 0.02 * Math.sin(i / 11);
    const 开 = 0.1;
    const e = { id: '测', 段: '甲', 段内帧: 0, 文件头帧: 头 / 2000, 文件: 'x', 配音: '配音/测', 字: '测', 角色: '甲', 位置: '下' as const, 屏们: [], 有声: [[开, 0.8]] as [number, number][], 开, 完: 0.8, 开口帧: 头 / 2000 + 开 * 24 };
    const r = 核对开口([e], 混, 24, () => 语);
    expect(r.最大差).toBeLessThan(0.1);
  });

  it.skipIf(!有基线 || !有ffmpeg)('字幕卡：和旧项目 Chrome 画的 1440p 卡逐像素一样（旧卡在就比）', () => {
    const 旧目录 = path.join(path.dirname(代码根()), '..', '机械动力应力转动-AI漫画', '参考模型库', '工具', '合成第六章', 'out', '透明层', '字幕-1440p');
    const 参数 = path.join(旧目录, '字幕卡参数.json');
    if (!fs.existsSync(参数)) return;
    const 屏们 = (JSON.parse(fs.readFileSync(参数, 'utf8')) as { 屏们: { 字: string; 位置: '下' | '思索上' }[] }).屏们;
    const 解 = (png: string | Buffer) => {
      const r = spawnSync('ffmpeg', ['-v', 'error', '-i', typeof png === 'string' ? png : 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { input: typeof png === 'string' ? undefined : png, maxBuffer: 1 << 28 });
      return r.stdout;
    };
    for (const [i, p] of 屏们.slice(0, 12).entries()) {
      const 旧 = path.join(旧目录, '裁', `${String(i).padStart(3, '0')}.png`);
      if (!fs.existsSync(旧)) continue;
      const 卡 = 画字幕卡(p.字, p.位置, 2560, 1440);
      const a = 解(卡.png);
      const b = 解(旧);
      expect(a.length, p.字).toBe(b.length);
      let 差 = 0;
      for (let k = 0; k < a.length; k++) 差 = Math.max(差, Math.abs(a[k]! - b[k]!));
      expect(差, p.字).toBeLessThanOrEqual(1);
    }
  });
});
