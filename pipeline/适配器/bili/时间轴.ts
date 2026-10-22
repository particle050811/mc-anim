// 把 B 站稿件对到本地交付（时长差 ≤1.5 秒，标题里的章号落在交付「第a-b章」范围内优先），再把留存和弹幕按段切开。
// 留存曲线只有约 18 档，段比档短时段内是线性插值，报告里要注明。
import fs from 'node:fs';
import path from 'node:path';
import type { 交付manifest } from '../剪映/剪辑包.ts';
import type { 留存点, 稿件 } from './数据.ts';

export type 交付 = { 目录: string; m: 交付manifest & { 时长秒: number; 完成?: string } };
export type 段区间 = { 编号: string; 键: string; 名: string; 起: number; 止: number };
export type 段统计 = 段区间 & {
  入留存: number;
  出留存: number;
  /** 段内流失的百分点（占全部观众） */
  流失: number;
  /** 在场观众每 10 秒流失的比例，跨段可比 */
  每10秒相对流失: number;
  /** 比同类稿件同一时段多走的观众（占全部观众的百分点；同类按进段时的在场比例折算）；没有同类曲线是 NaN */
  超同类流失: number;
  弹幕: number;
  每10秒弹幕: number;
};

export const 读交付们 = (根: string): 交付[] =>
  (fs.existsSync(根) ? fs.readdirSync(根) : [])
    .map((n) => path.join(根, n))
    .filter((d) => fs.existsSync(path.join(d, 'manifest.json')))
    .map((d) => ({ 目录: d, m: JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')) }))
    .filter((x) => typeof x.m.时长秒 === 'number' && Array.isArray(x.m.段));

/** 交付名「第6-7章」→ [6, 7]；不是这种名字返回 null */
export const 章范围 = (名: string): [number, number] | null => {
  const m = /^第(\d+)(?:-(\d+))?章$/.exec(名);
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null;
};

/** 标题里独立出现的数字（「应力转动 6 出征暮色」→ [6]，「应力转动（1-3）」→ [1, 3]） */
export const 标题数字 = (标题: string) => [...标题.matchAll(/(?<!\d)\d{1,3}(?!\d)/g)].map((m) => Number(m[0]));

export const 对交付 = (稿: Pick<稿件, '标题' | '时长'>, 们: 交付[], 容差 = 1.5): 交付 | null => {
  const 候选 = 们.filter((x) => Math.abs(x.m.时长秒 - 稿.时长) <= 容差);
  const 分 = (x: 交付) => {
    const r = 章范围(x.m.名);
    const 章对 = r !== null && 标题数字(稿.标题).some((n) => n >= r[0] && n <= r[1]);
    return (章对 ? 2 : 0) + (r ? 1 : 0);
  };
  候选.sort((a, b) => 分(b) - 分(a) || (b.m.完成 ?? '').localeCompare(a.m.完成 ?? ''));
  return 候选[0] && 分(候选[0]) >= 2 ? 候选[0] : null;
};

export const 段区间们 = (m: 交付manifest): 段区间[] =>
  m.段.map((s) => ({
    编号: s.编号 ?? s.键,
    键: s.键,
    名: s.键.replace(/^\d+-/, ''),
    起: s.全片起帧 / m.帧率,
    止: (s.全片起帧 + s.帧数) / m.帧率,
  }));

/** 留存曲线在 t 秒处的值（线性插值；超出末档取末档） */
export const 留存于 = (曲: 留存点[], t: number) => {
  if (!曲.length) return NaN;
  if (t <= 曲[0]!.秒) return 曲[0]!.留存;
  for (let i = 1; i < 曲.length; i++) {
    const a = 曲[i - 1]!;
    const b = 曲[i]!;
    if (t <= b.秒) return a.留存 + ((b.留存 - a.留存) * (t - a.秒)) / (b.秒 - a.秒 || 1);
  }
  return 曲.at(-1)!.留存;
};

export const 按段统计 = (段们: 段区间[], 曲: 留存点[], 弹幕秒: number[], 同类: 留存点[] = []): 段统计[] =>
  段们.map((s, i) => {
    const 长 = Math.max(s.止 - s.起, 1e-6);
    const 入 = 留存于(曲, s.起);
    const 出 = 留存于(曲, s.止);
    const 末段 = i === 段们.length - 1;
    const 弹幕 = 弹幕秒.filter((t) => t >= s.起 && (t < s.止 || (末段 && t <= s.止))).length;
    const 相对 = 入 > 0 ? 1 - Math.pow(出 / 入, 10 / 长) : NaN;
    const 同入 = 留存于(同类, s.起);
    const 同出 = 留存于(同类, s.止);
    const 超 = 同入 > 0 ? 入 - 出 - 入 * (1 - 同出 / 同入) : NaN;
    return { ...s, 入留存: 入, 出留存: 出, 流失: 入 - 出, 每10秒相对流失: 相对, 超同类流失: 超, 弹幕, 每10秒弹幕: (弹幕 * 10) / 长 };
  });

/** 弹幕按 bin 秒分箱计数 */
export const 弹幕密度 = (弹幕秒: number[], 时长: number, bin = 5) => {
  const n = Math.max(1, Math.ceil(时长 / bin));
  const 箱 = new Array<number>(n).fill(0);
  for (const t of 弹幕秒) 箱[Math.min(n - 1, Math.max(0, Math.floor(t / bin)))]!++;
  return 箱.map((c, i) => ({ 起: i * bin, 数: c }));
};
