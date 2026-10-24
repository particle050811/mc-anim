// 第 9–11 句的声音（原版音效，作品资产表里的）：种树苗、插牌子、五发烟花的发射、炸开、噼啪，「绽」那一下的相机咔哒。
// 都按歌曲帧排，跨段的由 声音/跨段音效.ts 切成每段一截；三段的 段.ts 用 本段音效 取自己那几截。纯数据。
// 文件长度是 ffprobe 量的；火箭、炸开的文件开头就起音。咔哒照 场/1-隐世之境一楼/参数.ts 的 咔哒声（起音 0.13 秒，同一个文件）。
import { clamp01 } from '@engine/anim/anim.ts';
import type { 资产cue } from '@engine/段/段定义.ts';
import { 烟花声音们 } from '@库/特效/烟花.ts';
import { fps, 歌曲帧, 正片事件 } from '../../分镜.ts';
import { 段里那截, type 歌上音效 } from '../../声音/跨段音效.ts';
import { 烟花们, 插牌秒, 声音增益, 种下秒 } from './门口之夜参数.ts';

export const 门口之夜音效资产 = {
  种树苗: '音效/把回忆拼好给你/block.cherry_sapling.place.1',
  插牌子: '音效/block.wood.place.1',
  发射: '音效/把回忆拼好给你/entity.firework_rocket.launch',
  炸: '音效/把回忆拼好给你/entity.firework_rocket.blast',
  大炸: '音效/把回忆拼好给你/entity.firework_rocket.large_blast',
  噼啪: '音效/把回忆拼好给你/entity.firework_rocket.twinkle',
  咔哒: '音效/车万女仆/item.camera_use',
} as const;
const 文件秒 = { 种树苗: 0.403, 插牌子: 0.5, 发射: 1.625, 炸: 1.0, 大炸: 2.0, 噼啪: 1.334, 咔哒: 0.88 } as const;
const 咔哒起音秒 = 0.13;

/** 「绽」咔哒定格以后，世界里还在响的（最大那发的炸声）0.25 秒里收掉：照片定住了，声音也停在那一下 */
const 定格收秒 = 0.25;
const 定格帧 = 正片事件.第11句照片.帧;
const 定格收 = (帧: number) => clamp01(1 - (帧 - 定格帧) / (定格收秒 * fps));

const 一条 = (种: keyof typeof 门口之夜音效资产, 名: string, 秒: number, 起音秒 = 0, 跟定格 = true): 歌上音效 => {
  const g = 声音增益[种];
  return {
    资产: 门口之夜音效资产[种],
    名,
    起帧: 歌曲帧(秒 - 起音秒),
    时长秒: 文件秒[种],
    增益: 跟定格 ? (帧) => g * 定格收(帧) : () => g,
  };
};

export const 门口之夜音效: readonly 歌上音效[] = [
  一条('种树苗', '种樱花树苗', 种下秒),
  一条('插牌子', '插告示牌', 插牌秒),
  ...烟花们.flatMap((发) => 烟花声音们(发).map((s) => 一条(s.种, `烟花${发.名}${s.种}`, s.秒))),
  一条('咔哒', '咔哒', 正片事件.第11句照片.秒, 咔哒起音秒, false),
];

/** 落在这一段窗口里的那几截（帧是段内帧） */
export const 本段音效 = (窗: { 起帧: number; 止帧: number }): 资产cue[] =>
  门口之夜音效.map((音) => 段里那截(窗, 音)).filter((c): c is 资产cue => c !== null);
