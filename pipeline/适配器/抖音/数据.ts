// 抖音创作者中心数据：取数.js 在浏览器里打的包（原样存进数据根 平台/抖音/<UTC 月日-时分>/数据.json），这里解析成分析要用的形状。
// 接口（作品详情页实际调的，10-22 核对）：作品列表 janus/douyin/creator/pc/work_list；指标 web/api/creator/item/mget?fields=metrics（字符串小数）；
// 留存 janus/.../data/realtime/analysis/data_center?analysis_type=1（3 秒一档、键 "MM:SS"，similar_author 是同类作者参考线）、=7 是各档跳出；
// 进度 janus/.../bff/data/progress/analysis/v2（jump_forward 跳过、jump_backward 回看，12 秒一档、键是档中点秒数）；来源 data/item/play/source；看后搜 item_analysis/search/keyword。
import { dataPath } from '../../环境/配置.ts';
import type { RetentionPoint } from '../bili/数据.ts';
import { importPackage, latestPackage } from '../平台/存放.ts';
import type { CurveDraft } from '../平台/图与排名.ts';

type KeyValue = { key: string; value: number };
type RawWork = {
  id: string;
  标题: string;
  时长毫秒: number;
  发布: number;
  指标: Record<string, string> | null;
  留存: { 本作: KeyValue[]; 同类作者: KeyValue[] } | null;
  跳出: { 本作: KeyValue[]; 同类作者: KeyValue[] } | null;
  进度: { 跳过: KeyValue[]; 回看: KeyValue[] } | null;
  来源: KeyValue[] | null;
  搜索词: { 看后搜: { keyword: string; percent: number }[]; 搜到: { keyword: string; percent: number }[] } | null;
};
export type DouyinRawPackage = { 版本: number; 平台: '抖音'; 取于: string; 作品: RawWork[]; 错误: unknown[]; 请求数: number; 停于风控: string | null; 说明?: string };

export type DouyinWork = CurveDraft & {
  指标: {
    plays: number;
    likes: number;
    评论: number;
    shares: number;
    favorites: number;
    newFans: number;
    /** 以下都是 0～1 的比例；封面点击率只在封面被展示（主页、搜索等）时才有，样本见 封面曝光 */
    completionRate: number | null;
    两秒跳出率: number | null;
    五秒完播率: number | null;
    avgViewSec: number | null;
    avgViewShare: number | null;
    coverClickRate: number | null;
    coverExposure: number | null;
    likeRate: number | null;
    fanViewShare: number | null;
  };
  跳过: { 秒: number; 值: number }[];
  回看: { 秒: number; 值: number }[];
  来源: { 名: string; share: number }[];
  看后搜: { keyword: string; share: number }[];
};

const sourceNames: Record<string, string> = { homepage_hot: '推荐', follow: '关注', homepage: '个人主页', message: '私信', familiar: '朋友', search: '搜索', other: '其他' };
const optNum = (v: string | undefined) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
/** "MM:SS" → 秒 */
export const formatMinSec = (k: string) => {
  const [m, s] = k.split(':').map(Number);
  return (m ?? 0) * 60 + (s ?? 0);
};
export const douyinCurve = (keyValues: KeyValue[] | undefined): RetentionPoint[] => {
  const curvePoints = (keyValues ?? []).filter((d) => d.value >= 0).map((d) => ({ 秒: formatMinSec(d.key), 留存: d.value })).sort((a, b) => a.秒 - b.秒);
  return curvePoints.length && curvePoints[0]!.秒 === 0 ? curvePoints : curvePoints.length ? [{ 秒: 0, 留存: 1 }, ...curvePoints] : [];
};
/** 标题取描述里第一个 # 或换行之前 */
export const douyinTitle = (desc: string) => desc.split(/[#\n]/)[0]!.trim().slice(0, 40);

export const parseDouyin = (rawPack: DouyinRawPackage): DouyinWork[] =>
  rawPack.作品.map((a) => {
    const m = a.指标 ?? {};
    const duration = a.时长毫秒 / 1000;
    return {
      id: a.id,
      标题: douyinTitle(a.标题),
      时长: duration,
      发布: new Date(a.发布 * 1000).toISOString(),
      留存: douyinCurve(a.留存?.本作).filter((p) => p.秒 <= duration),
      peerRetention: douyinCurve(a.留存?.同类作者).filter((p) => p.秒 <= duration),
      danmakuSec: [],
      弹幕: [],
      指标: {
        plays: optNum(m.view_count) ?? 0,
        likes: optNum(m.like_count) ?? 0,
        评论: optNum(m.comment_count) ?? 0,
        shares: optNum(m.share_count) ?? 0,
        favorites: optNum(m.favorite_count) ?? 0,
        newFans: optNum(m.subscribe_count) ?? 0,
        completionRate: optNum(m.completion_rate),
        两秒跳出率: optNum(m.bounce_rate_2s),
        五秒完播率: optNum(m.completion_rate_5s),
        avgViewSec: optNum(m.avg_view_second),
        avgViewShare: optNum(m.avg_view_proportion),
        coverClickRate: optNum(m.cover_click_rate),
        coverExposure: optNum(m.cover_show),
        likeRate: optNum(m.like_rate),
        fanViewShare: optNum(m.fan_view_proportion),
      },
      跳过: (a.进度?.跳过 ?? []).map((d) => ({ 秒: Number(d.key), 值: d.value })),
      回看: (a.进度?.回看 ?? []).map((d) => ({ 秒: Number(d.key), 值: d.value })),
      来源: (a.来源 ?? []).map((d) => ({ 名: sourceNames[d.key] ?? d.key, share: d.value })).sort((x, y) => y.share - x.share),
      看后搜: (a.搜索词?.看后搜 ?? []).map((d) => ({ keyword: d.keyword, share: d.percent })),
    };
  });

export const douyinRoot = () => dataPath('平台', '抖音');
export const importDouyin = (file: string, root = douyinRoot()) => importPackage<DouyinRawPackage>(file, root, (rawPack) => rawPack.平台 === '抖音' && Array.isArray(rawPack.作品));
export const latestDouyin = (root = douyinRoot()) => latestPackage<DouyinRawPackage>(root);
