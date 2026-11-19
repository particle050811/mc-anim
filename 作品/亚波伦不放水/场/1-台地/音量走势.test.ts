// 用户 11-19 选的试听版 F：照成片的每个输出帧（60 帧）取 <SegSound> 实际用的增益（放法.ts，取这一帧开头那一刻），和 F 的公式比。
// 战斗曲比「原来 −22 LUFS 的增益 × 抬升 × 淡入淡出」；非配乐比「去掉音量走势重建的同一段」的倍数；结算曲的两处衔接比等功率曲线。
import { describe, expect, it, vi } from 'vitest';
import { segFrameCount, type SegmentDef } from '@engine/段/段定义.ts';
import { segPlayPlan, type SoundItem } from '@engine/段/放法.ts';
import type { SoundTable } from '@engine/段/声音助手.ts';
import { musicInSec } from '../../角色/动作/忘情牛肉面时长.ts';
import timeline from './时间线.ts';

const keys = ['1-召唤', '2-开盘', '4-齐放', '5-击败'] as const;

type Loaded = { key: string; seg: SegmentDef; table: SoundTable };
const loadSegs = async (): Promise<Loaded[]> =>
  Promise.all(
    keys.map(async (key) => ({
      key,
      seg: (await import(`../../段/${key}/段.ts`)).default as SegmentDef,
      table: (await import(`../../段/${key}/声音表.生成.ts`)).default as SoundTable,
    })),
  );

const actual = await loadSegs();
// 不带音量走势的同一批段：清掉模块表重新载入场时间线，去掉它的 gainAutomation 再载入各段（各段拿到的是这一份）
vi.resetModules();
const fresh = (await import('./时间线.ts')).default as { gainAutomation?: unknown };
delete fresh.gainAutomation;
const plain = await loadSegs();

const ev = timeline.events;
const T = { appear: ev.yaBoLunAppears.sec, cast: ev.volleyCast.sec, done: ev.volleyDone.sec };
const dB = (g: number) => 20 * Math.log10(g);
const fromDb = (d: number) => 10 ** (d / 20);
const cosEase = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
const battle = '配乐/亚波伦/決戦の刻';

/** F 的战斗曲：−22 LUFS × 3 dB × 出手前再抬 3 dB（半余弦）× 等功率淡入淡出 */
const battleFormula = (t: number, fileLufs: number) => {
  const base = fromDb(-22 - fileLufs) * fromDb(3);
  const lift = 1 + (fromDb(3) - 1) * cosEase((t - (T.cast - 1.272)) / 0.5);
  const fadeIn = t < T.appear ? Math.sin((Math.PI / 2) * ((t - (T.appear - 1.5)) / 1.5)) : 1;
  const fadeOut = t > T.done - 0.122 ? Math.cos((Math.PI / 2) * Math.min(1, (t - (T.done - 0.122)) / 1.15)) : 1;
  return base * lift * fadeIn * fadeOut;
};
/** F 的非配乐倍数：出手前 −7 dB 一收（1 + (a − 1)·s1·(1 − s2)），轰炸里 −3 dB */
const sfxFormula = (t: number) => {
  const s1 = cosEase((t - (T.cast - 0.172)) / 0.13);
  const s2 = cosEase((t - (T.cast - 0.042)) / 0.037);
  const dip = 1 + (fromDb(-7) - 1) * s1 * (1 - s2);
  const down = cosEase((t - (T.cast + 0.128)) / 0.3);
  const up = cosEase((t - (T.done - 0.222)) / 0.15);
  return dip * (1 + (fromDb(-3) - 1) * down * (1 - up));
};

/** 一段每个输出帧上正在放的每一声：成片秒、增益 */
const perFrame = (x: Loaded, filter: (s: SoundItem) => boolean) => {
  const plan = segPlayPlan(x.seg, x.table, { lineGain: 1 });
  const start = x.seg.sceneWindow!.startSec;
  const out: { sec: number; item: number; gain: number; name: string }[] = [];
  for (let k = 0; k < segFrameCount(x.seg, 60); k++) {
    const t = k / 60;
    plan.forEach((s, i) => {
      if (filter(s) && t >= s.startSec - 1e-9 && t < s.startSec + s.durSec - 1e-9) out.push({ sec: start + t, item: i, gain: s.增益(t - s.startSec), name: s.name });
    });
  }
  return out;
};

type Dev = { maxDb: number; maxAbs: number; frames: number; where: string };
const track = (d: Dev, got: number, want: number, where: string) => {
  d.frames++;
  const abs = Math.abs(got - want);
  if (abs > d.maxAbs) d.maxAbs = abs;
  if (want > 0.01 && got > 0) {
    const e = Math.abs(dB(got) - dB(want));
    if (e > d.maxDb) [d.maxDb, d.where] = [e, where];
  }
};
const newDev = (): Dev => ({ maxDb: 0, maxAbs: 0, frames: 0, where: '' });

describe('试听版 F（用户 11-19 选）', () => {
  it('战斗曲：每个输出帧的增益 = 原增益 × 抬升 × 淡入淡出，片 4.9 秒前没有、19.5 秒淡到 0', () => {
    const d = newDev();
    const lufs = actual[0]!.table.asset[battle]!.loudness!;
    let [first, last] = [Infinity, -Infinity];
    for (const x of actual) {
      const frames = perFrame(x, (s) => s.asset === battle);
      // 同一帧只有一条战斗曲
      expect(new Set(frames.map((f) => f.sec.toFixed(6))).size).toBe(frames.length);
      for (const f of frames) {
        track(d, f.gain, battleFormula(f.sec, lufs), `${x.key} ${f.sec.toFixed(3)} 秒`);
        [first, last] = [Math.min(first, f.sec), Math.max(last, f.sec)];
      }
    }
    console.log(`战斗曲：${d.frames} 帧，最大偏差 ${d.maxDb.toFixed(4)} dB（${d.where}），倍数差最大 ${d.maxAbs.toExponential(2)}；首帧 ${first.toFixed(3)} 秒，末帧 ${last.toFixed(3)} 秒`);
    expect(d.maxDb).toBeLessThan(0.1);
    expect(d.maxAbs).toBeLessThan(0.01);
    expect(first).toBeGreaterThanOrEqual(T.appear - 1.5 - 1e-9);
    expect(first).toBeLessThan(T.appear - 1.5 + 1 / 60);
    expect(last).toBeLessThan(T.done + 1.028);
  });

  it('非配乐：每一声每个输出帧的增益 ÷ 不带音量走势的同一声 = F 的倍数（出手前 −7 dB 一收、轰炸里 −3 dB）', () => {
    const d = newDev();
    const picked = new Map<string, Dev>();
    for (const [i, x] of actual.entries()) {
      const isSfx = (s: SoundItem) => !s.asset.startsWith('配乐/');
      const got = perFrame(x, isSfx);
      const base = perFrame(plain[i]!, isSfx);
      expect(got.length).toBe(base.length);
      got.forEach((f, j) => {
        const b = base[j]!;
        expect([f.item, f.sec]).toEqual([b.item, b.sec]);
        if (b.gain <= 0) return;
        const want = sfxFormula(f.sec);
        track(d, f.gain / b.gain, want, `${x.key}「${f.name}」${f.sec.toFixed(3)} 秒`);
        for (const [name, lo, hi] of [['张盘', 12.25, 12.55], ['下界氛围-开场', 12.25, 12.55], ['现身雷声', 12.25, 12.55], ['结界火', 18.15, 18.5]] as const) {
          if (f.name !== name || f.sec < lo || f.sec > hi) continue;
          const p = picked.get(name) ?? newDev();
          picked.set(name, p);
          track(p, f.gain / b.gain, want, `${x.key} ${f.sec.toFixed(3)} 秒`);
        }
      });
    }
    console.log(`非配乐：${d.frames} 帧次，倍数最大偏差 ${d.maxDb.toFixed(4)} dB（${d.where}），倍数差最大 ${d.maxAbs.toExponential(2)}`);
    for (const [name, p] of picked) console.log(`  ${name}：${p.frames} 帧，最大偏差 ${p.maxDb.toFixed(4)} dB`);
    expect(picked.size).toBe(4);
    expect(d.maxDb).toBeLessThan(0.1);
    expect(d.maxAbs).toBeLessThan(0.01);
  });

  it('结算曲：5-击败 段尾从文件头放起、0.06 秒等功率淡入，到段缝正好放到 musicInSec；6-结算舞 片尾前 1.5 秒等功率淡到 0', async () => {
    const seg6 = (await import('../../段/6-结算舞/段.ts')).default as SegmentDef;
    const table6 = (await import('../../段/6-结算舞/声音表.生成.ts')).default as SoundTable;
    const music = '配乐/结算舞/DreamFunk忘情牛肉面';
    const g = fromDb(-18 - table6.asset[music]!.loudness!);
    const seg5 = actual[3]!;
    const lead = segPlayPlan(seg5.seg, seg5.table, { lineGain: 1 }).find((s) => s.asset === music)!;
    const dur5 = seg5.seg.sec;
    expect(lead.入点秒).toBe(0);
    expect(lead.startSec + lead.durSec).toBeCloseTo(dur5, 9);
    expect(lead.durSec).toBeCloseTo(musicInSec, 9);
    const body = segPlayPlan(seg6, table6, { lineGain: 1 }).find((s) => s.asset === music)!;
    expect(body.入点秒).toBe(musicInSec);
    const d = newDev();
    for (let k = Math.ceil(lead.startSec * 60); k < Math.round(dur5 * 60); k++) {
      const t = k / 60 - lead.startSec;
      track(d, lead.增益(t), g * Math.sin((Math.PI / 2) * Math.min(1, t / 0.06)), `5-击败 段内 ${(k / 60).toFixed(3)} 秒`);
    }
    for (let k = 0; k < Math.round(seg6.sec * 60); k++) {
      const t = k / 60;
      const x = (t - (seg6.sec - 1.5)) / 1.5;
      track(d, body.增益(t), g * (x > 0 ? Math.cos((Math.PI / 2) * x) : 1), `6-结算舞 ${t.toFixed(3)} 秒`);
    }
    expect(body.增益(seg6.sec)).toBe(0);
    console.log(`结算曲：${d.frames} 帧，最大偏差 ${d.maxDb.toFixed(4)} dB（${d.where}），倍数差最大 ${d.maxAbs.toExponential(2)}`);
    expect(d.maxDb).toBeLessThan(0.1);
    expect(d.maxAbs).toBeLessThan(0.01);
  });
});
