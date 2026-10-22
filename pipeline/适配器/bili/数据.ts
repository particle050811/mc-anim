// B 站创作中心数据：取数.js 在浏览器里打的包（原样存进数据根 平台/bilibili/<UTC 月日-时分>/数据.json），这里解析成分析要用的形状。
// 接口（创作中心页面实际调的，10-22 核对）：稿件列表 x/web/data/archive/index；指标对比 archive_diagnose/compare；
// 播放分析 archive_diagnose/play_analyze；总览和观众画像 archive_diagnose/overview；转粉 trans_fans_analyze；按天/小时趋势 trend；
// 留存 x/web/data/v2/archive/analyze/graph?cid=（viewer_quit：duration_key 秒处还在看的观众万分比，约 18 档；peer_ 前缀是同类稿件）；
// 弹幕 api x/v2/dm/search（progress 毫秒）；评论 x/v2/reply/up/fulllist。比率字段都是万分制，*_med 是自己近期稿件中位数。
import { 数据路径 } from '../../环境/配置.ts';
import { 导入包, 最新包 } from '../平台/存放.ts';

type 档 = { duration_key: number; num: number };
type 原始分P = { cid: number; 标题: string; 时长: number; 留存: { viewer_quit?: 档[]; peer_viewer_quit?: 档[]; dm?: 档[] } | null; 弹幕: { progress: number; msg: string }[] };
type 原始稿件 = {
  bvid: string;
  标题: string;
  时长: number;
  发布: number;
  对比: { stat: Record<string, number> } | null;
  总览: { stat?: Record<string, number>; gender?: { male: number; female: number }; play_proportion?: Record<string, number> } | null;
  播放分析: { arc_audience?: { tip?: string }; guest_interact?: Record<string, unknown> } | null;
  分P: 原始分P[];
  评论: { msg: string }[];
};
export type 原始包 = { 版本: number; 取于: string; 稿件: 原始稿件[]; 错误: unknown[]; 请求数: number; 停于风控: string | null };

export type 留存点 = { 秒: number; 留存: number };
export type 稿件 = {
  bvid: string;
  /** 同 bvid，平台无关代码用 */
  标识: string;
  标题: string;
  时长: number;
  发布: string;
  指标: {
    播放: number;
    点赞: number;
    投币: number;
    收藏: number;
    分享: number;
    评论: number;
    弹幕: number;
    涨粉: number;
    /** 以下都是 0～1 的比例 */
    完播率: number;
    封标点击率: number | null;
    三秒跳出率: number | null;
    互动率: number | null;
    播转粉率: number | null;
    游客占比: number | null;
  };
  /** 接口给的 *_med（页面没标口径，只作参考，0～1） */
  中位: { 封标点击率: number | null; 三秒跳出率: number | null; 互动率: number | null };
  /** 页面上的「超过了 x% 同类稿件」（0～1）和「高于/低于过往」（play_analyze 的 *_compare：1 高于、2 低于） */
  超过同类: { 封标点击率: number | null; 三秒跳出率: number | null; 互动率: number | null };
  较过往: { 封标点击率: '高于' | '低于' | null; 三秒跳出率: '高于' | '低于' | null; 互动率: '高于' | '低于' | null };
  平台解读: string | null;
  /** 第一个分 P 的留存曲线，含 (0, 1)；取不到是空数组 */
  留存: 留存点[];
  同类留存: 留存点[];
  /** 弹幕出现的秒数（第一个分 P） */
  弹幕秒: number[];
  弹幕: { 秒: number; 文本: string }[];
};

const 万分 = (v: unknown) => (typeof v === 'number' ? v / 10000 : null);
const 比 = (v: unknown) => (v === 1 ? '高于' : v === 2 ? '低于' : null);

export const 曲线 = (档们: 档[] | undefined): 留存点[] => {
  if (!档们?.length) return [];
  const 点 = 档们.filter((d) => d.num >= 0).map((d) => ({ 秒: d.duration_key, 留存: d.num / 10000 }));
  return [{ 秒: 0, 留存: 1 }, ...点.sort((a, b) => a.秒 - b.秒)];
};

export const 解析 = (包: 原始包): 稿件[] =>
  包.稿件.map((s) => {
    const st = s.对比?.stat ?? {};
    const 总 = s.总览?.stat ?? {};
    const p = s.分P[0];
    const g = (s.播放分析?.guest_interact ?? {}) as Record<string, number>;
    const 数 = (k: string) => (typeof st[k] === 'number' ? st[k]! : typeof 总[k] === 'number' ? 总[k]! : 0);
    const 弹幕 = (p?.弹幕 ?? []).map((d) => ({ 秒: d.progress / 1000, 文本: d.msg })).sort((a, b) => a.秒 - b.秒);
    return {
      bvid: s.bvid,
      标识: s.bvid,
      标题: s.标题,
      时长: s.时长,
      发布: new Date(s.发布 * 1000).toISOString(),
      指标: {
        播放: 数('play'),
        点赞: 数('like'),
        投币: 数('coin'),
        收藏: 数('fav'),
        分享: 数('share'),
        评论: 数('comment'),
        弹幕: 数('dm'),
        涨粉: st.total_new_attention_cnt ?? 总.fan ?? 0,
        完播率: (st.full_play_ratio ?? 0) / 10000,
        封标点击率: 万分(st.tm_rate),
        三秒跳出率: 万分(st.crash_rate),
        互动率: 万分(st.interact_rate),
        播转粉率: 万分(st.play_trans_fan_rate),
        游客占比: 万分(st.play_viewer_rate),
      },
      中位: { 封标点击率: 万分(st.tm_rate_med), 三秒跳出率: 万分(st.crash_rate_med), 互动率: 万分(st.interact_rate_med) },
      超过同类: { 封标点击率: 万分(g.tm_pass_rate ?? st.tm_pass_rate), 三秒跳出率: 万分(g.crash_pass_rate), 互动率: 万分(g.interact_pass_rate) },
      较过往: { 封标点击率: 比(g.tm_compare), 三秒跳出率: 比(g.crash_compare), 互动率: 比(g.interact_compare) },
      平台解读: s.播放分析?.arc_audience?.tip || null,
      留存: 曲线(p?.留存?.viewer_quit),
      同类留存: 曲线(p?.留存?.peer_viewer_quit).filter((x) => x.秒 <= s.时长),
      弹幕秒: 弹幕.map((d) => d.秒),
      弹幕,
    };
  });

// ---------- 数据根里的存放：平台/bilibili/<UTC 月日-时分>/数据.json ----------

export const bili根 = () => 数据路径('平台', 'bilibili');

export const 导入 = (文件: string, 根 = bili根()) => 导入包<原始包>(文件, 根, (包) => Array.isArray(包.稿件));

export const 最新数据 = (根 = bili根()) => {
  const 有 = 最新包<原始包>(根);
  if (!有) throw new Error(`${根} 下还没有数据：先在浏览器里跑 取数.js，再 anim 平台 导入 <json>`);
  return 有;
};
