// 抖音创作者中心数据：取数.js 在浏览器里打的包（原样存进数据根 平台/抖音/<UTC 月日-时分>/数据.json），这里解析成分析要用的形状。
// 接口（作品详情页实际调的，10-22 核对）：作品列表 janus/douyin/creator/pc/work_list；指标 web/api/creator/item/mget?fields=metrics（字符串小数）；
// 留存 janus/.../data/realtime/analysis/data_center?analysis_type=1（3 秒一档、键 "MM:SS"，similar_author 是同类作者参考线）、=7 是各档跳出；
// 进度 janus/.../bff/data/progress/analysis/v2（jump_forward 跳过、jump_backward 回看，12 秒一档、键是档中点秒数）；来源 data/item/play/source；看后搜 item_analysis/search/keyword。
import { 数据路径 } from '../../环境/配置.ts';
import type { 留存点 } from '../bili/数据.ts';
import { 导入包, 最新包 } from '../平台/存放.ts';
import type { 曲线稿 } from '../平台/图与排名.ts';

type 键值 = { key: string; value: number };
type 原始作品 = {
  id: string;
  标题: string;
  时长毫秒: number;
  发布: number;
  指标: Record<string, string> | null;
  留存: { 本作: 键值[]; 同类作者: 键值[] } | null;
  跳出: { 本作: 键值[]; 同类作者: 键值[] } | null;
  进度: { 跳过: 键值[]; 回看: 键值[] } | null;
  来源: 键值[] | null;
  搜索词: { 看后搜: { keyword: string; percent: number }[]; 搜到: { keyword: string; percent: number }[] } | null;
};
export type 抖音原始包 = { 版本: number; 平台: '抖音'; 取于: string; 作品: 原始作品[]; 错误: unknown[]; 请求数: number; 停于风控: string | null; 说明?: string };

export type 抖音作品 = 曲线稿 & {
  指标: {
    播放: number;
    点赞: number;
    评论: number;
    分享: number;
    收藏: number;
    涨粉: number;
    /** 以下都是 0～1 的比例；封面点击率只在封面被展示（主页、搜索等）时才有，样本见 封面曝光 */
    完播率: number | null;
    两秒跳出率: number | null;
    五秒完播率: number | null;
    平均播放秒: number | null;
    平均播放占比: number | null;
    封面点击率: number | null;
    封面曝光: number | null;
    点赞率: number | null;
    粉丝播放占比: number | null;
  };
  跳过: { 秒: number; 值: number }[];
  回看: { 秒: number; 值: number }[];
  来源: { 名: string; 占比: number }[];
  看后搜: { 词: string; 占比: number }[];
};

const 来源名: Record<string, string> = { homepage_hot: '推荐', follow: '关注', homepage: '个人主页', message: '私信', familiar: '朋友', search: '搜索', other: '其他' };
const 数 = (v: string | undefined) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
/** "MM:SS" → 秒 */
export const 分秒 = (k: string) => {
  const [m, s] = k.split(':').map(Number);
  return (m ?? 0) * 60 + (s ?? 0);
};
export const 抖音曲线 = (们: 键值[] | undefined): 留存点[] => {
  const 点 = (们 ?? []).filter((d) => d.value >= 0).map((d) => ({ 秒: 分秒(d.key), 留存: d.value })).sort((a, b) => a.秒 - b.秒);
  return 点.length && 点[0]!.秒 === 0 ? 点 : 点.length ? [{ 秒: 0, 留存: 1 }, ...点] : [];
};
/** 标题取描述里第一个 # 或换行之前 */
export const 抖音标题 = (desc: string) => desc.split(/[#\n]/)[0]!.trim().slice(0, 40);

export const 解析抖音 = (包: 抖音原始包): 抖音作品[] =>
  包.作品.map((a) => {
    const m = a.指标 ?? {};
    const 时长 = a.时长毫秒 / 1000;
    return {
      标识: a.id,
      标题: 抖音标题(a.标题),
      时长,
      发布: new Date(a.发布 * 1000).toISOString(),
      留存: 抖音曲线(a.留存?.本作).filter((p) => p.秒 <= 时长),
      同类留存: 抖音曲线(a.留存?.同类作者).filter((p) => p.秒 <= 时长),
      弹幕秒: [],
      弹幕: [],
      指标: {
        播放: 数(m.view_count) ?? 0,
        点赞: 数(m.like_count) ?? 0,
        评论: 数(m.comment_count) ?? 0,
        分享: 数(m.share_count) ?? 0,
        收藏: 数(m.favorite_count) ?? 0,
        涨粉: 数(m.subscribe_count) ?? 0,
        完播率: 数(m.completion_rate),
        两秒跳出率: 数(m.bounce_rate_2s),
        五秒完播率: 数(m.completion_rate_5s),
        平均播放秒: 数(m.avg_view_second),
        平均播放占比: 数(m.avg_view_proportion),
        封面点击率: 数(m.cover_click_rate),
        封面曝光: 数(m.cover_show),
        点赞率: 数(m.like_rate),
        粉丝播放占比: 数(m.fan_view_proportion),
      },
      跳过: (a.进度?.跳过 ?? []).map((d) => ({ 秒: Number(d.key), 值: d.value })),
      回看: (a.进度?.回看 ?? []).map((d) => ({ 秒: Number(d.key), 值: d.value })),
      来源: (a.来源 ?? []).map((d) => ({ 名: 来源名[d.key] ?? d.key, 占比: d.value })).sort((x, y) => y.占比 - x.占比),
      看后搜: (a.搜索词?.看后搜 ?? []).map((d) => ({ 词: d.keyword, 占比: d.percent })),
    };
  });

export const 抖音根 = () => 数据路径('平台', '抖音');
export const 导入抖音 = (文件: string, 根 = 抖音根()) => 导入包<抖音原始包>(文件, 根, (包) => 包.平台 === '抖音' && Array.isArray(包.作品));
export const 最新抖音 = (根 = 抖音根()) => 最新包<抖音原始包>(根);
