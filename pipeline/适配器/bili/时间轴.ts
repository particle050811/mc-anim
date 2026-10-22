// 把 B 站稿件对到本地交付（时长差 ≤1.5 秒，标题里的章号落在交付「第a-b章」范围内优先），再把留存和弹幕按段切开。
// 留存曲线只有约 18 档，段比档短时段内是线性插值；开头窗内的流失不记到段上（见 按段统计）。
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
  /** 计入排名的起点：开头窗之后的部分（段跨窗时只算窗后） */
  计起: number;
  /** 计入排名的终点：片尾那一档（片子放完人全走）之前 */
  计止: number;
  /** 整段落在开头窗内，不参与排名 */
  窗内: boolean;
  /** 整段落在片尾那一档里，不参与排名 */
  片尾: boolean;
  /** 计入的部分不到半档：数值只是所在档的平均，不参与排名 */
  过短: boolean;
  /** 在场观众每 10 秒流失的比例（只算 [计起, 计止]），跨段可比；窗内、片尾段是 NaN */
  每10秒相对流失: number;
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

/** 在场观众在 [起, 止] 内每 10 秒流失的比例 */
export const 每10秒流失 = (曲: 留存点[], 起: number, 止: number) => {
  const 入 = 留存于(曲, 起);
  return 止 > 起 && 入 > 0 ? 1 - Math.pow(留存于(曲, 止) / 入, 10 / (止 - 起)) : NaN;
};

/** 留存曲线相邻两档的间隔（中位） */
export const 档宽 = (曲: 留存点[]) => {
  const 间隔 = 曲.slice(1).map((p, i) => p.秒 - 曲[i]!.秒).sort((a, b) => a - b);
  return 间隔.length ? 间隔[Math.floor(间隔.length / 2)]! : 0;
};

/** 默认开头窗：推荐流「刷到就划走」集中在开头，这段时间的流失不记到任何段头上（窗长是假设，报告里用同账号其他稿件检验） */
export const 默认开头窗 = 40;

export const 按段统计 = (段们: 段区间[], 曲: 留存点[], 弹幕秒: number[], 开头窗 = 默认开头窗): 段统计[] => {
  const 片长 = 段们.at(-1)?.止 ?? 0;
  // 末档落在片子结尾时，那一档的流失是「放完了」，插值会把它摊到最后几段上
  const 末 = 曲.at(-1);
  const 有效止 = 末 && 曲.length > 2 && 末.秒 >= 片长 - 1 ? 曲.at(-2)!.秒 : Infinity;
  const 宽 = 档宽(曲);
  return 段们.map((s, i) => {
    const 长 = Math.max(s.止 - s.起, 1e-6);
    const 入 = 留存于(曲, s.起);
    const 出 = 留存于(曲, s.止);
    const 末段 = i === 段们.length - 1;
    const 弹幕 = 弹幕秒.filter((t) => t >= s.起 && (t < s.止 || (末段 && t <= s.止))).length;
    const 计起 = Math.max(s.起, 开头窗);
    const 计止 = Math.min(s.止, 有效止);
    const 窗内 = 计起 >= s.止;
    const 片尾 = !窗内 && 计起 >= 计止;
    const 相对 = 窗内 || 片尾 ? NaN : 每10秒流失(曲, 计起, 计止);
    const 过短 = 计止 - 计起 < 宽 / 2;
    return { ...s, 入留存: 入, 出留存: 出, 流失: 入 - 出, 计起, 计止, 窗内, 片尾, 过短, 每10秒相对流失: 相对, 弹幕, 每10秒弹幕: (弹幕 * 10) / 长 };
  });
};

/** 弹幕按 bin 秒分箱计数 */
export const 弹幕密度 = (弹幕秒: number[], 时长: number, bin = 5) => {
  const n = Math.max(1, Math.ceil(时长 / bin));
  const 箱 = new Array<number>(n).fill(0);
  for (const t of 弹幕秒) 箱[Math.min(n - 1, Math.max(0, Math.floor(t / bin)))]!++;
  return 箱.map((c, i) => ({ 起: i * bin, 数: c }));
};

/** 排名的单位：够长的段单独一个；连续的短段（不到半档）合成一组，攒够半档再算，免得短段拿到的只是所在档的平均 */
export type 排名单元 = { 编号: string; 名: string; 起: number; 止: number; 计起: number; 计止: number; 键们: string[]; 每10秒相对流失: number };
export const 排名单元们 = (段: 段统计[], 曲: 留存点[]) => {
  const 半档 = 档宽(曲) / 2;
  const 可 = 段.filter((s) => !s.窗内 && !s.片尾);
  const 单元: 排名单元[] = [];
  const 成 = (组: 段统计[]): 排名单元 => {
    const a = 组[0]!;
    const b = 组.at(-1)!;
    return {
      编号: 组.length > 1 ? `${a.编号}～${b.编号}` : a.编号,
      名: 组.length > 1 ? `${a.名}～${b.名}` : a.名,
      起: a.起, 止: b.止, 计起: a.计起, 计止: b.计止,
      键们: 组.map((s) => s.键),
      每10秒相对流失: 每10秒流失(曲, a.计起, b.计止),
    };
  };
  let 组: 段统计[] = [];
  const 组长 = () => (组.length ? 组.at(-1)!.计止 - 组[0]!.计起 : 0);
  for (const s of 可) {
    if (!s.过短) {
      if (组.length) 单元.push(成(组));
      组 = [];
      单元.push(成([s]));
      continue;
    }
    组.push(s);
    if (组长() >= 半档) {
      单元.push(成(组));
      组 = [];
    }
  }
  if (组.length && 组长() >= 半档 / 2) 单元.push(成(组));
  const 均值 = 可.length ? 每10秒流失(曲, 可[0]!.计起, 可.at(-1)!.计止) : NaN;
  return { 单元: 单元.filter((u) => Number.isFinite(u.每10秒相对流失)), 均值 };
};
