// 撕裂（goety:rupture_focus）的元数据。出处见 撕裂.tsx。
import { 定义法术元 } from '../接口.ts';

/** 撕开的预热：游戏里 蓄力 120 − 5 = 115 刻；片里压成 60（自己定的） */
export const 撕裂预热刻 = 60;
/** 裂隙开着的刻数：游戏里 duration 300；片里只放 60（自己定的） */
export const 撕裂张开刻 = 60;
/** 合上的刻数：写死 20，之后爆 */
export const 撕裂合上刻 = 20;
export const 撕裂爆刻 = 撕裂预热刻 + 撕裂张开刻 + 撕裂合上刻;

export default 定义法术元({
  id: 'rupture',
  长秒: (撕裂爆刻 + 30) / 20,
  命中秒: 撕裂爆刻 / 20,
  声音: [
    { 资产: '音效/诡厄巫法/goety.void_prepare_spell.1', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.rumble.1', 秒: 0, 音量: 2 },
    { 资产: '音效/诡厄巫法/goety.rumble.2', 秒: (撕裂预热刻 / 3) / 20, 音量: 2 },
    { 资产: '音效/诡厄巫法/goety.rumble.3', 秒: ((撕裂预热刻 * 2) / 3) / 20, 音量: 2 },
    { 资产: '音效/诡厄巫法/goety.void_rift_open', 秒: 撕裂预热刻 / 20, 音量: 5 },
    { 资产: '音效/block.respawn_anchor.deplete.1', 秒: 撕裂爆刻 / 20, 音量: 5, 音高: 0.5 },
    { 资产: '音效/entity.generic.explode.1', 秒: 撕裂爆刻 / 20, 音量: 5, 音高: 0.5 },
  ],
});
