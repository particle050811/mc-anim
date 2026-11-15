// B 站创作中心数据：取数.js 在浏览器里打的包（原样存进数据根 平台/bilibili/<UTC 月日-时分>/数据.json），这里解析成分析要用的形状。
// 接口（创作中心页面实际调的，10-22 核对）：稿件列表 x/web/data/archive/index；指标对比 archive_diagnose/compare；
// 播放分析 archive_diagnose/play_analyze；总览和观众画像 archive_diagnose/overview；转粉 trans_fans_analyze；按天/小时趋势 trend；
// 留存 x/web/data/v2/archive/analyze/graph?cid=（viewer_quit：duration_key 秒处还在看的观众万分比，约 18 档；peer_ 前缀是同类稿件）；
// 弹幕 api x/v2/dm/search（progress 毫秒）；评论 x/v2/reply/up/fulllist。比率字段都是万分制，*_med 是自己近期稿件中位数。
import { dataPath } from '../../环境/配置.ts';
import { importPackage, latestPackage } from '../平台/存放.ts';

type TierPoint = { duration_key: number; num: number };
type RawPart = { cid: number; 标题: string; 时长: number; 留存: { viewer_quit?: TierPoint[]; peer_viewer_quit?: TierPoint[]; dm?: TierPoint[] } | null; 弹幕: { progress: number; msg: string }[] };
type RawSubmission = {
  bvid: string;
  标题: string;
  时长: number;
  发布: number;
  对比: { stat: Record<string, number> } | null;
  总览: { stat?: Record<string, number>; gender?: { male: number; female: number }; play_proportion?: Record<string, number> } | null;
  播放分析: { arc_audience?: { tip?: string }; guest_interact?: Record<string, unknown> } | null;
  分P: RawPart[];
  评论: { msg: string }[];
};
export type RawBundle = { 版本: number; 取于: string; 稿件: RawSubmission[]; 错误: unknown[]; 请求数: number; 停于风控: string | null };

export type RetentionPoint = { 秒: number; 留存: number };
export type Submission = {
  bvid: string;
  /** 同 bvid，平台无关代码用 */
  id: string;
  标题: string;
  时长: number;
  发布: string;
  指标: {
    plays: number;
    likes: number;
    coins: number;
    favorites: number;
    shares: number;
    评论: number;
    弹幕: number;
    newFans: number;
    /** 以下都是 0～1 的比例 */
    completionRate: number;
    coverCtr: number | null;
    threeSecBounceRate: number | null;
    interactRate: number | null;
    playToFanRate: number | null;
    visitorShare: number | null;
  };
  /** 接口给的 *_med（页面没标口径，只作参考，0～1） */
  median: { coverCtr: number | null; threeSecBounceRate: number | null; interactRate: number | null };
  /** 页面上的「超过了 x% 同类稿件」（0～1）和「高于/低于过往」（play_analyze 的 *_compare：1 高于、2 低于） */
  beatPeers: { coverCtr: number | null; threeSecBounceRate: number | null; interactRate: number | null };
  vsPast: { coverCtr: '高于' | '低于' | null; threeSecBounceRate: '高于' | '低于' | null; interactRate: '高于' | '低于' | null };
  platformReading: string | null;
  /** 第一个分 P 的留存曲线，含 (0, 1)；取不到是空数组 */
  留存: RetentionPoint[];
  peerRetention: RetentionPoint[];
  /** 弹幕出现的秒数（第一个分 P） */
  danmakuSec: number[];
  弹幕: { 秒: number; 文本: string }[];
};

const perTenThousand = (v: unknown) => (typeof v === 'number' ? v / 10000 : null);
const compareLabel = (v: unknown) => (v === 1 ? '高于' : v === 2 ? '低于' : null);

export const retentionCurve = (buckets: TierPoint[] | undefined): RetentionPoint[] => {
  if (!buckets?.length) return [];
  const curvePoints = buckets.filter((d) => d.num >= 0).map((d) => ({ 秒: d.duration_key, 留存: d.num / 10000 }));
  return [{ 秒: 0, 留存: 1 }, ...curvePoints.sort((a, b) => a.秒 - b.秒)];
};

export const parsePackage = (rawPack: RawBundle): Submission[] =>
  rawPack.稿件.map((s) => {
    const st = s.对比?.stat ?? {};
    const overview = s.总览?.stat ?? {};
    const p = s.分P[0];
    const g = (s.播放分析?.guest_interact ?? {}) as Record<string, number>;
    const statOf = (k: string) => (typeof st[k] === 'number' ? st[k]! : typeof overview[k] === 'number' ? overview[k]! : 0);
    const danmaku = (p?.弹幕 ?? []).map((d) => ({ 秒: d.progress / 1000, 文本: d.msg })).sort((a, b) => a.秒 - b.秒);
    return {
      bvid: s.bvid,
      id: s.bvid,
      标题: s.标题,
      时长: s.时长,
      发布: new Date(s.发布 * 1000).toISOString(),
      指标: {
        plays: statOf('play'),
        likes: statOf('like'),
        coins: statOf('coin'),
        favorites: statOf('fav'),
        shares: statOf('share'),
        评论: statOf('comment'),
        弹幕: statOf('dm'),
        newFans: st.total_new_attention_cnt ?? overview.fan ?? 0,
        completionRate: (st.full_play_ratio ?? 0) / 10000,
        coverCtr: perTenThousand(st.tm_rate),
        threeSecBounceRate: perTenThousand(st.crash_rate),
        interactRate: perTenThousand(st.interact_rate),
        playToFanRate: perTenThousand(st.play_trans_fan_rate),
        visitorShare: perTenThousand(st.play_viewer_rate),
      },
      median: { coverCtr: perTenThousand(st.tm_rate_med), threeSecBounceRate: perTenThousand(st.crash_rate_med), interactRate: perTenThousand(st.interact_rate_med) },
      beatPeers: { coverCtr: perTenThousand(g.tm_pass_rate ?? st.tm_pass_rate), threeSecBounceRate: perTenThousand(g.crash_pass_rate), interactRate: perTenThousand(g.interact_pass_rate) },
      vsPast: { coverCtr: compareLabel(g.tm_compare), threeSecBounceRate: compareLabel(g.crash_compare), interactRate: compareLabel(g.interact_compare) },
      platformReading: s.播放分析?.arc_audience?.tip || null,
      留存: retentionCurve(p?.留存?.viewer_quit),
      peerRetention: retentionCurve(p?.留存?.peer_viewer_quit).filter((x) => x.秒 <= s.时长),
      danmakuSec: danmaku.map((d) => d.秒),
      弹幕: danmaku,
    };
  });

// ---------- 数据根里的存放：平台/bilibili/<UTC 月日-时分>/数据.json ----------

export const biliRoot = () => dataPath('平台', 'bilibili');

export const importData = (file: string, root = biliRoot()) => importPackage<RawBundle>(file, root, (rawPack) => Array.isArray(rawPack.稿件));

export const latestData = (root = biliRoot()) => {
  const latestPacket = latestPackage<RawBundle>(root);
  if (!latestPacket) throw new Error(`${root} 下还没有数据：先在浏览器里跑 取数.js，再 anim platform import <json>`);
  return latestPacket;
};
